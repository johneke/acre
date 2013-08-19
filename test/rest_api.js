var assert = require('assert');
var express = require('express');
var http = require('http');
var request = require('request');

// lets start testing!!

// describe an enclosure for the entire test plan
describe('REST API', function(){
    var app, mongoose, acre;

    // before each of our test suites run, we need to do some setup:
    beforeEach(function(){
        // first initialize acre and its dependencies (express, and mongoose)
        app = express();
        mongoose = require('mongoose');
        acre = require('acre');

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
            name: {
                type: String,
                required: true,
                index: true
            },
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

    // after each of our test suites run, we want to de-init acre and its dependencies
    // this cleanup is important as it makes sure that each test suite is run on a CLEAN
    // config, and errors arent carried over between test suites
    afterEach(function(){
        // desroy acre
        delete acre;
        acre = null;

        // destroy express app
        delete app;
        app = null;

        // this is a bit of a hacky way to de-init mongoose
        delete mongoose.models.Library;
        delete mongoose.models.AcreAdmin;
        delete mongoose.modelSchemas.Library;
        delete mongoose.modelSchemas.AcreAdmin;
        delete mongoose;
        mongoose = null;
    });

    // describe an enclosure for our test suites for the acre.init method
    describe('init()', function(){
        it('should initialize acre (good args, default options)', function(done){
            acre
            .init(mongoose, app)
            .then(function(){
                done();
            }, function(error){
                done(error)
            });
        });
    });

    // describe an enclosure for our test suites for the acre.pre method
    describe('acre.pre CREATE', function(){
        var server;

        // before each of our acre.pre test suites run, we want to... 
        beforeEach(function(done){
            // give mongoose time to connect, mongohq sandbox db is sometimes slow
            this.timeout(3000);

            // setup acre and an acre.pre method that we will test with
            // this acre.pre method should reject any library created with the name 'Maxwell McOdrum'
            acre = require('acre');
            acre.pre(acre.CREATE, '/libraries', function(request, response, next){
                console.log(request.body);
                if (request.body.name === 'Maxwell McOdrum')
                {
                    response.send(400, 'Bad Request');
                }
                else
                {
                    request.body.name = 'Simon Says: ' + request.body.name;
                    next();
                }
            });

            // initialize acre
            acre
            .init(mongoose, app)
            .then(function(){
                // after acre init is done, here we can connect to the database
                mongoose.connect('mongodb://test:test@paulo.mongohq.com:10088/acre-tests');
                var db = mongoose.connection;
                db.on('error', console.error.bind(console, 'connection error:'));
                db.once('open', function() {
                    // after database connects, now we can start the web server
                    server = http.createServer(app).listen(3000, function(){
                        console.log("web server listening on port 3000...");
                        done();
                    });
                });
            }, function(error){
                // if acre init fails, report any errors
                done(new Error(error));
            });

        });

        afterEach(function(done){
            // give more time for cleanup
            this.timeout(1000);

            function cleanupWebServer()
            {
                server.once('close', function(){
                    // only done once http server is shutdown
                    console.log('web server closed');
                    done();
                });

                // shutdown the web server
                server.close();
            }

            function cleanupDB()
            {
                function finishedDBCleanup()
                {
                    // shutdown the connection to the database
                    mongoose.connection.close();
                    cleanupWebServer();
                }

                // empty the database after each test runs
                mongoose.models.Library.count(function(error, count){
                    if (error)
                    {
                        done(error);
                    }
                    else
                    {
                        // apparntly you cant empty out an empty database, so need to check first
                        if (count > 0)
                        {
                            mongoose.connection.collections['libraries'].drop(function(error){
                                if (error)
                                {
                                    done(error);
                                }
                                else
                                {
                                    finishedDBCleanup();
                                }
                            });
                        }
                        else
                        {
                            finishedDBCleanup();
                        }
                    }
                });
            }

            // fire off db cleanup function
            cleanupDB();
        })

        it('should reject library named Maxwell McOdrum', function(done){
            var library = {
                name: 'Maxwell McOdrum',
                books: []
            };

            // try creating a library called 'Maxwell McOdrum'
            request.put('http://localhost:3000/libraries', {json: library}, function(error, response, body){
                if (error)
                {
                    done(error);
                }
                else
                {
                    // we should get an error code 400
                    assert.equal(response.statusCode, 400);
                    // body of the response must say 'Bad Request'
                    assert.equal(body, 'Bad Request');
                    done();
                }
            })
        });

        it('should permit library not named Maxwell McOdrum', function(done){
            var library = {
                name: 'City Library',
                books: []
            };

            // try creating a library with name 'City Library'
            request.put('http://localhost:3000/libraries', {json: library}, function(error, response, body){
                if (error)
                {
                    done(error);
                }
                else
                {
                    // should pass, status code should be 200 OK, means CREATE was successful
                    assert.equal(response.statusCode, 200);

                    // check the database to see if it was indeed added
                    mongoose.models.Library.find(function(error, libraries){
                        if (error)
                        {
                            done(error);
                        }
                        else
                        {
                            // check that there is only one library in the database: the one we just added
                            assert.equal(libraries.length, 1);
                            // check that library name is correct as modified by our acre.pre method
                            assert.equal(libraries[0].name, 'Simon Says: City Library');
                            // check that the library indeed has no books
                            assert.equal(libraries[0].books.length, 0);
                            done();
                        }
                    });
                }
            })
        });
    });
});
