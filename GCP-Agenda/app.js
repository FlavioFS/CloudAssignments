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

// Gets URL content
function httpGet(options, callback)
{
	console.log(options);
	var request = http2.request(options, function (res) {
	    var data = '';

	    res.on('data', function (chunk) {
	        data += chunk;
	    });

	    res.on('end', function () {
	        callback(null, data);
	    });
	});

	request.on('error', function (e) {
	    callback(e, null);
	});

	request.end();
}



/* ==================================================================
 *    Libraries and Constants
 * ================================================================== */
const express = require('express');
const app = express();
const http2 = require('http');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3000;



//// Google Cloud Platform
// Storage
const Storage = require("@google-cloud/storage");
const storage = Storage();
const bucket = storage.bucket("f30-awesome-bucket");

// Bigtable
let logHistory = '';
const logName = 'Log';
const familyName = 'operations';

// PostgreSQL
const PgDAO = require('./PgDAO');
const pgdao = new PgDAO(
	{
		user:       "userGoesHere", // default env var: PGUSER
		database:   "dbnameGoesHere",   // default env var: PGDATABASE
		password:   "passGoesHere", // default env var: PGPASSWORD
		host:       "hostGoesHere",     // Server hosting the postgres database
		port:       portGoesHere,     // default env var: PGPORT
		max: 10,                                    // max number of clients in the pool
		idleTimeoutMillis: 120000                   // how long a client is allowed to remain idle before being closed
	}
);



/* ==================================================================
 *    BigTable
 * ==================================================================
 *    This service is responsibe for storing the Log in a NO-SQL database.
 */



/* ==================================================================
 *    Storage
 * ==================================================================
 *    This service is responsible for storing photos in a bucket.
 */
function storagePut (request)
{
	let filename = request.query.name.replace(/\s/g,'');
	let blob = bucket.file(filename);
	let blobStream = blob.createWriteStream();

	blobStream.on("error", (err) => {
		try {
			next(err);
		} catch (err) {
			console.log("Storage error: " + err);
		}
	});

	blobStream.on("finish", () => {
		var options = {
		    host: "storage.googleapis.com",
		    path: "/" + bucket.name + "/" + filename
		};

		console.log(options);

		httpGet(options, (err, data) => {
			if (err)
				console.log("Storage error: " + err.errno);
			else
				console.log("Put: " + data);
		});
	});

	blobStream.end(request.query.photoUrl);
}

function storageDelete (request) {
	let blob = bucket.file(request.query.name.replace(/\s/g,''));

	blob.delete((err, data) => {
		if (err)
			console.log('Storage delete error');
		else
			console.log("Delete: " + request.query.name);
	});
}

function storageGet (name)
{
	let filename = name.replace(/\s/g,'');
	let blob = bucket.file(filename);
	let blobStream = blob.createReadStream();

	blobStream.on("error", (err) => {
		try {
			next(err);
		}
		catch (err) {
			console.log("Storage error: " + err);
			callback(err, null);
		}
	});

	blobStream.on("finish", () => {
		var options = {
			host: "storage.googleapis.com",
			path: "/" + bucket.name + "/" + filename
		};

		httpGet(options, (err, data) => {
			if (err)
				console.log("Storage error: " + err.errno);
			else {
				io.sockets.emit('photo', {
					name: name,
					photo: data
				});
			}
		});
	});

	blobStream.end();
}



/* ==================================================================
 *    PostgreSQL
 * ==================================================================
 *    Stores the contacts data in a PostgreSQL database.
 */
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
		sendInfoAndPhotos(result);
	});
}

function pgListUsers (request)
{
	let logTimer = process.hrtime();
	let datetime = new Date ();

	console.log("PG list:");
	pgdao.queryRetrieveUserList((result) => {
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
	let i = 0;
	for (let j = 0; j < result.data.rowCount; j++) {
		result.data.rows[j].birthday = getLogDate(result.data.rows[j].birthday);
		storageGet(result.data.rows[j].name);
	}

	io.sockets.emit('get', result.data.rows);
}



/* ==================================================================
 *    Socket.IO
 * ==================================================================
 *    Signals clients for events with the command below (which is used in modules above):
 *         io.sockets.emit("signal", {data: <msg>} );
 */
io.on('connection', () => {
	console.log("socket.io connected");
	io.sockets.emit('log', logHistory );
});



/* ==================================================================
 *    Express
 * ==================================================================
 *    Processes clients requests obtained from clients html forms through submit inputs.
 */
app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
	response.sendFile('index.html', {root: __dirname + '/public'});
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
		pgPost(request);    	// PostgreSQL section
		storagePut(request);	// Storage section
	}

	else if (request.query.postRadio == 'delete')
	{
		pgDelete(request);		// PostgreSQL section
		storageDelete(request);	// Storage section
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

	pgFilterUsers(request);	// PostgreSQL ans S3 nested
});

app.get('/list', function (request, response) {
	console.log("client list:");
	console.log(request.query);

	pgListUsers(request);	// PostgreSQL ans S3 nested
});



/* ==================================================================
 *    Http
 * ================================================================== */
http.listen(port, console.log("Listening on port: " + port));