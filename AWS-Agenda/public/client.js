/**
 * Created by Meron Soda on 05/04/17.
 */

"use strict";   // ES6

/* ==================================================================
 *    Const
 * ================================================================== */
const socket = io.connect(window.location.href);

const unknownPhoto = 'data:image/png;base64,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';

const photoPreview = $('#photoPreview');
const photoUrl = $('#photoUrl');
const postSubmit = $('#postSubmit');
const results = $('#results');
const lamp = $('.lamp');
const busName = $('#busName');
const busNick = $('#busNick');
const filtBirthMin = $('#filtBirthMin');
const filtBirthMax = $('#filtBirthMax');
const log = $('#log');


/* ==================================================================
 *    Utils
 * ================================================================== */
// Converts source image to base64
function toDataUrl(src, callback, outputFormat="image/png") {
    let img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
        let canvas = document.createElement('CANVAS');
        let ctx = canvas.getContext('2d');
        let dataURL;
        canvas.height = this.height;
        canvas.width = this.width;
        ctx.drawImage(this, 0, 0);
        dataURL = canvas.toDataURL(outputFormat);
        callback(dataURL);
    };
    img.src = src;
    if (img.complete || img.complete === undefined) {
        img.src = unknownPhoto;
        img.src = src;
    }
}

// Reads img URL from file picker
function readURL(input) {
    if (input.files && input.files[0]) {
        let reader = new FileReader();
        reader.onload = function (e) {
            photoPreview
                .attr('src', e.target.result)
                .width(100)
                .height(100);

            postSubmit.attr('disabled', true);      // Lock
            toDataUrl(photoPreview.attr('src'), function (dataURL) {
                photoUrl.attr('value', dataURL);
                postSubmit.attr('disabled', false); // Unlock
            });
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function msgToDiv (msg)
{
    for (let i=0; i<msg.length; ++i)
    {
        // Creates divs
        let $div = $(
            "<div class='container inlineBlock user'>" +
            "<img   class='block photo' src='"  + unknownPhoto +"'>" +
            "<label class='block'> Name:    "   + msg[i].name      + "</label>" +
            "<label class='block'> Nick:    "   + msg[i].nick      + "</label>" +
            "<label class='block'> E-mail:  "   + msg[i].email     + "</label>" +
            "<label class='block'> Phone:   "   + msg[i].phone     + "</label>" +
            "<label class='block'> Birthday:"   + msg[i].birthday  + "</label>" +
            "</div>"
        );
        results.append($div);
    }
}


/* ==================================================================
 *    MAIN
 * ================================================================== */
function main () {
    // Photo Preview
    $("#photoFile").change( function() {
        readURL(this);
    });


    function clearInputsGET (source, input1, input2) {
        if (source.val()) {
            input1.val('');
            input2.val('');
        }
    }

    //// Cannot choose Birthday range and (Name or Nick)
    // BUS code - Search by Name and/or Nick
    busName.change( () => clearInputsGET(busName, filtBirthMin, filtBirthMax) );
    busNick.change( () => clearInputsGET(busNick, filtBirthMin, filtBirthMax) );

    // FILT code - Filter by birthday range
    filtBirthMin.change( () => clearInputsGET(filtBirthMin, busName, busNick) );
    filtBirthMax.change( () => clearInputsGET(filtBirthMax, busName, busNick) );


    postSubmit.click( () => {
        lamp.removeClass('finished');
    });

    const results = $('#results');

    // Socket.IO
    function postDone (msg) {
        lamp.addClass('finished');
    }

    socket.on( 'post', postDone );
    socket.on( 'pgCreate', postDone );
    socket.on( 'pgUpdate', postDone );
    socket.on( 'pgDelete', postDone );

    socket.on( 'pgGet', (msg) => {
        results.html("");   // Clears results
        msgToDiv(msg);
    });

    socket.on( 's3Get', (msg) => {
        if (msg.photo)
            $("#results label:contains('" + msg.name + "')").siblings('img').attr('src', msg.photo);
    });

    socket.on( 'log', (msg) => {
        log.html(msg);
    });
}


$("document").ready(main);