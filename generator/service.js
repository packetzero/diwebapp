var express = require("express");
var url = require("url");
var path = require('path');
const fs = require('fs');
const _ = require('underscore');
var app = express();


 /* serves main page */
 app.get("/", function(req, res) {
   let templateString = fs.readFileSync(path.join(__dirname,'_home.tpl.html'),'utf8').toString();
   let template = _.template(templateString);
   data = {};
   res.send(template(data));
//    res.sendfile('index.htm')
 });

 /* serves all the static files */

app.get("/output/*", function(req, res){
    var url_parts = url.parse(req.url);
    var urlpath = url_parts.pathname;
    if (urlpath.indexOf("../..") >= 0) {
        res.send("Invalid request");
        return;
    }
    console.log('static file request : ' + urlpath);
    res.sendfile( path.join(__dirname,'..', urlpath));
});

// generate
 app.post("/generate", function(req, res) {
   var gen = require("./gendisched.js");
   var log = gen.generate();

   let templateString = fs.readFileSync(path.join(__dirname,'_results.tpl.html'),'utf8').toString();
   let template = _.template(templateString);
   data = { log: log};
   res.send(template(data));
 });


 var port = process.env.PORT || 80;
 app.listen(port, function() {
   console.log("Node service running ... " + port);
 });
