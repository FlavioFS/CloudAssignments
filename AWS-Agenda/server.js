/**
 * Created by Meron Soda on 05/04/17.
 */

/* ==================================================================
 *    Utils
 * ================================================================== */
// Calculates time string
function getLogDateTime(date)
{
	let year  = date.getFullYear();
	let month = date.getMonth() + 1;
	let day   = date.getDate();
	let hour  = date.getHours();
	let min   = date.getMinutes();
	let sec   = date.getSeconds();

	month = (month < 10 ? "0" : "") + month;
	day = (day < 10 ? "0" : "") + day;
	hour = (hour < 10 ? "0" : "") + hour;
	min = (min < 10 ? "0" : "") + min;
	sec = (sec < 10 ? "0" : "") + sec;

	return year + "-" + month + "-" + day + "/" + hour + ":" + min + ":" + sec;
}

// Converts time to milliseconds
function hrtimeToMs(hrtime)
{
	return parseInt(1000*hrtime[0] + (hrtime[1]/1000000));
}



/* ==================================================================
 *    Libraries and Constants
 * ================================================================== */
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3000;
const aws = require('aws-sdk');
aws.config.update({ region: 'us-west-2' });

// S3
const s3 = new aws.S3();
const bucketName = 'f30-awesome-bucket';

// PostgreSQL
const PgDAO = require('./PgDAO');
const pgdao = new PgDAO();

// DynamoDB
const dynamoDB = new aws.DynamoDB();
const dynamoDoc = new aws.DynamoDB.DocumentClient();
const logName = 'Log';
let logHistory = '';



/* ==================================================================
 *    DynamoDB (Init)
 * ================================================================== */
function dynamoInit() {
	let params = {
		TableName: logName,
		KeySchema: [
			{ AttributeName: "opcode",		KeyType: "HASH" },
			{ AttributeName: "fulltime",	KeyType: "RANGE" }
		],

		AttributeDefinitions: [
			{ AttributeName: "opcode",      AttributeType: "S" },
			{ AttributeName: "fulltime",    AttributeType: "S" }
		],

		ProvisionedThroughput: {
			ReadCapacityUnits: 4,
			WriteCapacityUnits: 4
		}
	};

	dynamoDB.createTable(params, (err, data) => {
		if (err)
			console.log("Dynamo - Create table failure: "  + JSON.stringify(err, null, 2));
		else
			console.log("Dynamo - Create table success: " + JSON.stringify(data, null, 2));

		dynamoDoc.scan({TableName: logName}, (err, data) => {
			if (err)
				console.log("Dynamo - Scan failure: "  + JSON.stringify(err, null, 2));

			if (data.Count <= 0)
				return;

			let logArray = [];
			for (let i=0; i<data.Count; i++)
				logArray.push(data.Items[i]);

			logArray.sort(function (a, b) {
				let cmp = a.fulltime.localeCompare(b.fulltime);
				if (cmp != 0)
					return  -cmp;
				return -a.opcode.localeCompare(b.opcode);
			});


			for (let i=0; i<logArray.length; i++)
				logHistory += logArray[i].opcode + ' -> [' + logArray[i].fulltime + ']  (' + logArray[i].duration + ' ms)\n';
		});
	});
}
dynamoInit();


function dynamoPostLog (opcode, datetime, logTimer)
{
	logTimer = process.hrtime(logTimer);

	let params = {
		TableName: logName,
		Item: {
			opcode: opcode,
			fulltime: getLogDateTime(datetime),
			duration: hrtimeToMs(logTimer),
			date: {
				year: datetime.getYear(),
				month: datetime.getMonth(),
				day: datetime.getDay(),
				hour: datetime.getHours(),
				minute: datetime.getMinutes(),
				second: datetime.getSeconds()
			}
		}
	};

	dynamoDoc.put(params, function (err, data) {
		if (err)
			console.log("Dynamo log failure: " + err);
		else
		{
			console.log("Dynamo log success: " + data);
			let item = this.request.rawParams.Item;
			logHistory =  item.opcode + ' -> [' + item.fulltime + ']  (' + item.duration + ' ms)\n' + logHistory;
			io.sockets.emit('log', logHistory );
		}
	});
}



/* ==================================================================
 *    S3
 * ================================================================== */
// S3 Init
function checkBucket ()
{
	let params = {
		Bucket: bucketName,
		CreateBucketConfiguration: {
			LocationConstraint: "us-west-2"
		}
	};

	s3.createBucket(params, (err, data) => {
		if (err)
			console.log("Cannot create this bucket:\n" + err);

		else
			console.log("Bucket created: " + params.Bucket);
	});
}
checkBucket();


// S3 Events
function s3Put (request)
{
	let params = {
		Bucket: bucketName,
		Key: request.query.name,
		Body: request.query.photoUrl
	};

	s3.putObject(params, (err, data) => {
		io.sockets.emit('s3update', { data: data, err: err } );

		if (err)
			console.log('S3 update error');
		else
			console.log(data);
	});
}

function s3Delete (request) {
	let params = {
		Bucket: bucketName,
		Key: request.query.name,
	};

	s3.deleteObject(params, (err, data) => {
		io.sockets.emit('s3delete', { err: err, data: data } );

		if (err)
			console.log('S3 delete error');
		else
			console.log(data);
	});
}

function s3Get (request, callback)
{
	let params = {
		Bucket: bucketName,
		Key: request.query.name,
	};

	s3.getObject(params, (err, data) => {
		callback({ err: err, data: data });

		if (err)
			console.log('S3 get error');
		else
			console.log(data);
	});
}



/* ==================================================================
 *    PostgreSQL
 * ================================================================== */
function pgPost (request)
{
	// Checks if user exists
	pgdao.queryRetrieveUser(request.query.name, (result) => {

		// Query fail
		if (result.err)
		{
			io.sockets.emit('pgPost', result.err );
			console.log(result);
		}

		// Query success
		else
		{
			let columns = {
				name: request.query.name,
				nick: request.query.nick,
				email: request.query.email,
				phone: request.query.phone,
				birthday: request.query.birthday
			};

			// User already exists: Update
			if (result.data.rowCount > 0)
				pgUpdate(columns);

			// User does not exist: Create
			else
				pgCreate(columns);
		}

	});
}

function pgCreate (columns)
{
	let logTimer = process.hrtime();
	let datetime = new Date ();

	pgdao.queryCreateUser(columns, (result) => {

		io.sockets.emit('pgCreate', result );
		console.log("PG create:");
		console.log(result);

		if (result.err)
			return;

		dynamoPostLog('CAD', datetime, logTimer);
	});
}

function pgUpdate (columns)
{
	let logTimer = process.hrtime();
	let datetime = new Date ();

	pgdao.queryUpdateUser(columns.name, columns, (result) => {

		io.sockets.emit('pgUpdate', result );
		console.log("PG update:");
		console.log(result);

		if (result.err)
			return;

		dynamoPostLog('ALT', datetime, logTimer);
	});
}

function pgDelete (request)
{
	let logTimer = process.hrtime();
	let datetime = new Date ();

	pgdao.queryDeleteUser(request.query.name, (result) => {

		io.sockets.emit('pgDelete', result);
		console.log("PG delete:");
		console.log(result);

		if (result.err)
			return;

		dynamoPostLog('EXC', datetime, logTimer);
	});
}

function pgRetrieveUsersByParams (request)
{
	let FILT = true;

	if (request.query.name != '' || request.query.nick != ''){
		request.query.birthdayMin = '';
		request.query.birthdayMax = '';
		FILT = false;
	}

	let params = {
		name: request.query.name,
		nick: request.query.nick,
		birthdayMin: request.query.birthdayMin,
		birthdayMax: request.query.birthdayMax
	};

	var logTimer = process.hrtime();
	var datetime = new Date ();

	console.log("PG search:");
	pgdao.queryRetrieveUsersByParams(params, (result) => {

		if (FILT)
			dynamoPostLog('FILT', datetime, logTimer);
		else
			dynamoPostLog('BUS', datetime, logTimer);

		sendPhotosFromS3(result);
	});
}

function pgListUsers (request)
{
	let logTimer = process.hrtime();
	let datetime = new Date ();

	console.log("PG list:");
	pgdao.queryRetrieveUserList((result) => {
		dynamoPostLog('LIST', datetime, logTimer);
		sendPhotosFromS3(result);
	});
}

function sendPhotosFromS3 (result) {

	if (result.err)
	{
		console.log(result.err);
		return result;
	}

	if (result.data.rowCount == 0)
	{
		io.sockets.emit('pgGet', []);
		return result;
	}

	let params = {
		Bucket: bucketName,
		Key: result.data.rows[0].name,
	};

	let i = 0;

	function recursiveCallback (err, data)
	{
		if (!err)
			io.sockets.emit('s3Get', {
				photo: data.Body.toString(),
				name: params.Key
			});

		else
			io.sockets.emit('s3Get', {
				photo: null,
				name: params.Key
			});

		console.log('s3 query emit.');

		i++;
		if (i >= result.data.rowCount || i<0)
		{
			console.log('s3 query done.');
			return;
		}

		params.Key = result.data.rows[i].name;
		s3.getObject(params, recursiveCallback);
	}

	io.sockets.emit('pgGet', result.data.rows);
	s3.getObject(params, recursiveCallback);
}



/* ==================================================================
 *    Socket.IO
 * ================================================================== */
io.on('connection', () => {
	console.log("socket.io connected");
	io.sockets.emit('log', logHistory );
});



/* ==================================================================
 *    Express
 * ================================================================== */
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
	response.sendFile('public/index.html', {root: __dirname});
});

app.get('/post', function (request, response) {
	console.log("client post:");
	console.log(request.query);

	if (!request.query.phone)
		request.query.phone = 0;

	if (!request.query.birthday)
		request.query.birthday = '2000-01-01';

	// Create or Update
	if (request.query.postRadio == 'update')
	{
		pgPost(request);    // PostgreSQL section
		s3Put(request);     // S3 section
	}

	else if (request.query.postRadio == 'delete')
	{
		pgDelete(request);  // PostgreSQL section
		s3Delete(request);  // S3 section
	}

});

app.get('/get', function (request, response) {
	console.log("client get:");
	console.log(request.query);

	pgRetrieveUsersByParams(request);   // PostgreSQL ans S3 nested
});

app.get('/list', function (request, response) {
	console.log("client list:");
	console.log(request.query);

	pgListUsers(request);   // PostgreSQL ans S3 nested
});



/* ==================================================================
 *    Http
 * ================================================================== */
http.listen(port, console.log("Listening on port: " + port));