var assert = require('assert');
var mongoose = require('mongoose');
var acre = require('acre');
var express = require('express');
var app = express();
var http = require('http');
var request = require('request');

describe('REST API', function(){
    beforeEach(function(){
        mongoose = require('mongoose');
        app = express();

        // setup express (web server)
        app.configure(function(){
            acre.bodyParser(app);
            app.use(express.bodyParser());
            app.use(express.cookieParser());
            app.use(express.methodOverride());
            app.use(app.router);
        });

        // setup mongoose schema (database component)
        var LibrarySchema = new mongoose.Schema({
            books: [{
                title: {
                    type: String,
                    required: true,
                    index: true
                },
                isdn: {
                    type: Number,
                    required: true
                },
                author: {
                    first_name: {
                        type: String,
                        required: true,
                        index: true
                    },
                    last_name: {
                        type: String,
                        required: true,
                        index: true
                    }
                }
            }]
        });
        mongoose.model('Library', LibrarySchema);
    });

    afterEach(function(){
        mongoose = null;
        app = null;
    });

    describe('init()', function(){
        it('should initialize acre', function(done){
            acre
            .init(mongoose, app)
            .then(function(){
                done();
            }, function(error){
                done(error)
            });
        });
    });

    describe('get all', function(){
        beforeEach(function(done){
            mongoose.connect('mongodb://test:test@paulo.mongohq.com:10088/acre-tests');
            var db = mongoose.connection;
            db.on('error', console.error.bind(console, 'connection error:'));
            db.once('open', function() {
                http.createServer(app).listen(3000, function(){
                    console.log("Express server listening on port 3000");
                    done();
                });
            });
        });

        it('should return all books', function(done){
            request.get('/', function(error, response, books){
                if (error)
                {
                    done(error);
                }
                else
                {
                    console.log('books:');
                    console.log(books);
                    done();
                }
            })
        });
    });
});
