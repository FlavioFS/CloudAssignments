/**
 * Created by Meron Soda on 05/04/17.
 */

/* ==================================================================
 *    Libraries
 * ================================================================== */
const aws = require('aws-sdk');
const s3 = new aws.S3();
const uuid = require('node-uuid');
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3000;


/* ==================================================================
 *    AWS Init
 * ================================================================== */
aws.config.update({region: 'us-west-2'});
const bucketName = 'f30-awesome-bucket-2';

// S3
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


/* ==================================================================
 *    Socket.IO
 * ================================================================== */
io.on('connection', () => console.log("socket.io connected") );


/* ==================================================================
 *    Express
 * ================================================================== */
var params = {
    Bucket: bucketName,
    Key: ''
};

app.use(express.static(__dirname + '/public'));

app.get('/', function (request, response) {
    response.sendFile('public/index.html', {root: __dirname});
});

app.get('/post', function (request, response) {
    console.log("post:");
    console.log(request.query);

    if (request.query.name == '')
        io.sockets.emit('post', { success: false, data: "Missing name." } );

    else if (request.query.postRadio == 'update')
    {
        params.Key = request.query.name;
        params.Body = request.query.photoUrl;
        s3.putObject(params, (err, data) => {
            if (err)
            {
                io.sockets.emit('post', { success: false, data: err } );
                console.log(err);
            }
            else
            {
                io.sockets.emit('post', { success: true, data: data } );
                console.log('post succeeded:');
                console.log(data);
            }
        });
    }
});

app.get('/get', function (request, response) {
    console.log("get:");
    console.log(request.query);

    if (request.query.name == '')
        io.sockets.emit('get', { success: false, data: "Missing name." } );

    else
    {
        if (params.Body) delete params.Body;
        params.Key = request.query.name;
        s3.getObject(params, (err, data) => {
            if (err)
            {
                io.sockets.emit('get', { success: false, data: err } );
                console.log(err);
            }
            else
            {
                io.sockets.emit('get', { success: true, data: data.Body.toString() } );
                console.log('get succeeded:');
                console.log(data);
            }
        });
    }
});

app.get('/list', function (request, response) {
    io.sockets.emit('get', { data: "user list" });
    console.log("list");
});


/* ==================================================================
 *    Http
 * ================================================================== */
http.listen(port, console.log("Listening on port: " + port));