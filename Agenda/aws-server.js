/**
 * Created by Meron Soda on 05/04/17.
 */

"use strict";   // ES6

/* ==================================================================
 *    Utils
 * ================================================================== */
// Calculates date string
function getLogDate(date)
{
	let year  = date.getFullYear();
	let month = date.getMonth() + 1;
	let day   = date.getDate();

	month = (month < 10 ? "0" : "") + month;
	day = (day < 10 ? "0" : "") + day;

	return year + "-" + month + "-" + day;
}

// Calculates datetime string
function getLogDateTime(date)
{
	let hour  = date.getHours();
	let min   = date.getMinutes();
	let sec   = date.getSeconds();

	hour = (hour < 10 ? "0" : "") + hour;
	min = (min < 10 ? "0" : "") + min;
	sec = (sec < 10 ? "0" : "") + sec;

	return getLogDate(date) + "/" + hour + ":" + min + ":" + sec;
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
const pgdao = new PgDAO({
    user:       process.env.RDS_PGSQL_USERNAME, // default env var: PGUSER
    database:   process.env.RDS_PGSQL_DBNAME,   // default env var: PGDATABASE
    password:   process.env.RDS_PGSQL_PASSWORD, // default env var: PGPASSWORD
    host:       process.env.RDS_PGSQL_HOST,     // Server hosting the postgres database
    port:       process.env.RDS_PGSQL_PORT,     // default env var: PGPORT
    max: 10,                                    // max number of clients in the pool
    idleTimeoutMillis: 120000                   // how long a client is allowed to remain idle before being closed
});

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
		if (err)
			console.log('S3 delete error');
		else
			console.log(data);
	});
}

function s3Get (name) {
	let params = {
		Bucket: bucketName,
		Key: name,
	};

	s3.getObject(params, (err, data) => {
		if (err)
			console.log('S3 delete error');
		else
			io.sockets.emit('photo', {
				name: name,
				photo: data.Body.toString()
			});
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
			io.sockets.emit('post', result.err );
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

		io.sockets.emit('create', result );
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

		io.sockets.emit('update', result );
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

		io.sockets.emit('delete', result);
		console.log("PG delete:");
		console.log(result);

		if (result.err)
			return;

		dynamoPostLog('EXC', datetime, logTimer);
	});
}

function pgSearchUsers (request)
{
	let params = {
		name: request.query.name,
		nick: request.query.nick,
		birthdayMin: '',
		birthdayMax: ''
	};

	var logTimer = process.hrtime();
	var datetime = new Date ();

	console.log("PG search:");
	pgdao.queryRetrieveUsersByParams(params, (result) => {
		dynamoPostLog('BUS', datetime, logTimer);
		sendInfoAndPhotos(result);
	});
}

function pgFilterUsers (request)
{
	let params = {
		name: '',
		nick: '',
		birthdayMin: request.query.birthdayMin,
		birthdayMax: request.query.birthdayMax
	};

	var logTimer = process.hrtime();
	var datetime = new Date ();

	console.log("PG search:");
	pgdao.queryRetrieveUsersByParams(params, (result) => {
		dynamoPostLog('FILT', datetime, logTimer);
		sendInfoAndPhotos(result);
	});
}

function pgListUsers (request)
{
	let logTimer = process.hrtime();
	let datetime = new Date ();

	console.log("PG list:");
	pgdao.queryRetrieveUserList((result) => {
		dynamoPostLog('LIST', datetime, logTimer);
		sendInfoAndPhotos(result);
	});
}

function sendInfoAndPhotos (result) {

	if (result.err) {
		console.log(result.err);
		return result;
	}

	if (result.data.rowCount == 0) {
		io.sockets.emit('get', []);
		return result;
	}


	// Formats date
	for (let j = 0; j < result.data.rowCount; j++) {
		result.data.rows[j].birthday = getLogDate(result.data.rows[j].birthday);
		s3Get(result.data.rows[j].name);
	}

	io.sockets.emit('get', result.data.rows);
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

	pgSearchUsers(request);   // PostgreSQL ans S3 nested
});

app.get('/filt', function (request, response) {
	console.log("client get:");
	console.log(request.query);

	pgFilterUsers(request);   // PostgreSQL ans S3 nested
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