/**
 * Created by Meron Soda on 05/04/17.
 */

function updatePhotoPreview()
{
    var file = $("photoFile");

    if(file.files.length)
    {
        var reader = new FileReader();

        reader.onload = function(e)
        {
            $(".photoPreview").css("background-image", "e.target.result");
            document.getElementById('outputDiv').innerHTML = e.target.result;
        };

        reader.readAsBinaryString(file.files[0]);
    }
}


function readURL(input) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            $('#blah')
                .attr('src', e.target.result)
                .width(100)
                .height(100);
        };
        reader.readAsDataURL(input.files[0]);
    }
}


function onPhotoChange() {
    var photoPreview = $(".photoPreview");
    console.log(photoPreview);
    console.log(photoPreview);
}

function main () {
    console.log("main");
    $(".photoFile").change(onPhotoChange);
}


$("document").ready(main);