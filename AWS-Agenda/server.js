/**
 * Created by Meron Soda on 05/04/17.
 */

/* ==================================================================
 *    Libraries and Constants
 * ================================================================== */
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3000;
const aws = require('aws-sdk');

// S3
const s3 = new aws.S3();
const bucketName = 'f30-awesome-bucket';

// PostgreSQL
const PgDAO = require('./PgDAO');
const pgdao = new PgDAO();


////// TEST SECTION -----------------------------------------------------------

//// CREATE
// Insert user
// let columns = {
//     name: 'Jason',
//     nick: 'JJ',
//     email: 'jason@jet.gov.uk',
//     phone: '+5511977775555',
//     birthday: '1991-12-25'
// };
// pgdao.queryCreateUser(columns, (result) => console.log(result));                 // Create User
// pgdao.queryCreateFriend('Fritz', 'John Doe', (result) => console.log(result));   // Create Friends


//// RETRIEVE
// pgdao.queryRetrieveUser('Dan', (result) => console.log(result) );        // Get User
// pgdao.queryRetrieveFriends('Dan', (result) => console.log(result) );   // Get Friends


//// UPDATE
// let newColumns = {
//     name: 'zzz',
//     nick: 'zzz',
//     email: 'zzz@zzz.zzz',
//     phone: '0101',
//     birthday: '1999-07-08'
// };
// pgdao.queryUpdateUser('aaa', newColumns, (result) => console.log(result));


//// DELETE
// pgdao.queryDeleteFriend("zzz", "Jason", (result) => console.log(result));    // Delete Friends
// pgdao.queryDeleteUser('zzz', (result) => console.log(result));               // Delete User


// --------------------------------------------------------------------------


/* ==================================================================
 *    S3
 * ================================================================== */
aws.config.update({region: 'us-west-2'});

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
        io.sockets.emit('s3update', { data: data, err: err} );

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
    pgdao.queryCreateUser(columns, (result) => {
        io.sockets.emit('pgCreate', result );

        console.log("PG create:");
        console.log(result);
    });
}

function pgUpdate (columns)
{
    pgdao.queryUpdateUser(columns.name, columns, (result) => {
        io.sockets.emit('pgUpdate', result );

        console.log("PG update:");
        console.log(result);
    });
}

function pgDelete (request)
{
    pgdao.queryDeleteUser(request.query.name, (result) => {
        io.sockets.emit('pgDel', result);

        console.log("PG delete:");
        console.log(result);
    });
}

function pgRetrieveUsersByParams (request)
{
    let params = {
        name: request.query.name,
        nick: request.query.nick,
        birthdayMin: request.query.birthdayMin,
        birthdayMax: request.query.birthdayMax
    };

    console.log("PG search:");
    pgdao.queryRetrieveUsersByParams(params, (result) => sendPhotosFromS3(result));
}

function pgListUsers (request)
{
    console.log("PG list:");
    pgdao.queryRetrieveUserList((result) => sendPhotosFromS3(result));
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
io.on('connection', () => console.log("socket.io connected") );


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