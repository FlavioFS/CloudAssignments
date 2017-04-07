/**
 * Created by Meron Soda on 05/04/17.
 */

/* ==================================================================
 *    Const
 * ================================================================== */
const s3 = new aws.S3();
const aws = require('aws-sdk');
const uuid = require('node-uuid');
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = 3000;


/* ==================================================================
 *    Utility
 * ================================================================== */
// Create a bucket and upload something into it
var bucketName = 'node-sdk-sample-' + uuid.v4();
var keyName = 'hello_world.txt';

function awsSample () {
  s3.createBucket({Bucket: bucketName}, function() {
    var params = {Bucket: bucketName, Key: keyName, Body: 'Hello World!'};
    s3.putObject(params, function(err, data) {
      if (err)
        console.log(err);
      else
        console.log("Successfully uploaded data to " + bucketName + "/" + keyName);
    });
  });
}


/* ==================================================================
 *    Express
 * ================================================================== */
app.use(express.static(__dirname + '/public'));


/* ==================================================================
 *    Socket.IO
 * ================================================================== */
function onConnection (socket) {
  socket.on( 'userpost',
      function(data) { socket.broadcast.emit('userpost', data) }
  );

  socket.on( 'userget',
      function(data) { socket.broadcast.emit('userget', data) }
  );

  socket.on( 'userlist',
      function(data) { socket.broadcast.emit('userlist', data) }
  );
}

io.on('connection', onConnection);


/* ==================================================================
 *    HTTP
 * ================================================================== */
http.listen(port, console.log("Listening on port: " + port));