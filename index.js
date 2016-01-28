'use strict';

var os = require('os');
var pm2 = require('pm2');
var pmx = require('pmx');
var request = require('request');

// Get the configuration from PM2
var conf = pmx.initModule();

// initialize buffer and queue_max opts
// buffer seconds can be between 1 and 5
conf.buffer_seconds = (conf.buffer_seconds > 0 && conf.buffer_seconds < 5) ? conf.buffer_seconds : 1;

// queue max can be between 10 and 100
conf.queue_max = (conf.queue_max > 10 && conf.queue_max <= 100) ? conf.queue_max : 100;

// Set the events that will trigger the color red
var redEvents = ['stop', 'exit', 'delete', 'error', 'kill', 'exception', 'restart overlimit', 'suppressed'];

// create the message queue
var messages = [];

// create the suppressed object for sending suppression messages
var suppressed = {
    isSuppressed: false,
    date: new Date().getTime()
};


// Function to send event to Slack's Incoming Webhook
function sendSlack(message) {

    var name = message.name;
    var event = message.event;
    var description = message.description;

    // If a Slack URL is not set, we do not want to continue and nofify the user that it needs to be set
    if (!conf.slack_url) return console.error("There is no Slack URL set, please set the Slack URL: 'pm2 set pm2-slack:slack_url https://slack_url'");

    // The default color for events should be green
    var color = '#008E00';
    // If the event is listed in redEvents, set the color to red
    if (redEvents.indexOf(event) > -1) {
        color = '#D00000';
    }

    // The JSON payload to send to the Webhook
    var payload = {
        username: os.hostname(),
        attachments: [{
            fallback: name + ' - ' + event + ' - ' + description,
            color: color,
            fields: [{
                title: name + ' - ' + event,
                value: description,
                short: true
            }]
        }]
    };

    // Options for the post request
    var options = {
        method: 'post',
        body: payload,
        json: true,
        url: conf.slack_url
    };

    // Finally, make the post request to the Slack Incoming Webhook
    request(options, function(err, res, body) {
        if (err) return console.error(err);
        if (body !== 'ok') {
            console.error('Error sending notification to Slack, verify that the Slack URL for incoming webhooks is correct.');
        }
    });
}

// Function to get the next buffer of messages (buffer length = 1s)
function bufferMessage() {
    var nextMessage = messages.shift();
  
    if (!conf.buffer) { return nextMessage; }
  
    nextMessage.buffer = [nextMessage.description];
  
    // continue shifting elements off the queue while they are the same event and timestamp so they can be buffered together into a single request
    // @TODO: allow buffer length to be longer than 1s
    while (messages.length 
        && (messages[0].timestamp >= nextMessage.timestamp && messages[0].timestamp < (nextMessage.timestamp + conf.buffer_seconds))
        && messages[0].event === nextMessage.event) {
      
        // append description to our buffer and shift the message off the queue and discard it
        nextMessage.buffer.push(messages[0].description);
        messages.shift();
    
    }
  
    // join the buffer with newlines
    nextMessage.description = nextMessage.buffer.join("\n");
  
    // delete the buffer from memory
    delete nextMessage.buffer;
  
    return nextMessage;
}

// Function to process the message queue
function processQueue() {

    // If we have a message in the message queue, removed it from the queue and send it to slack
    if (messages.length > 0) {
        sendSlack(bufferMessage());
    }

    // If there are over conf.queue_max messages in the queue, send the suppression message if it has not been sent and delete all the messages in the queue after this amount (default: 100)
    if (messages.length > conf.queue_max) {
        if (!suppressed.isSuppressed) {
            suppressed.isSuppressed = true;
            suppressed.date = new Date().getTime();
            sendSlack({
                name: 'pm2-slack',
                event: 'suppressed',
                description: 'Messages are being suppressed due to rate limiting.'
            });
        }
        messages.splice(conf.queue_max, messages.length);
    }

    // If the suppression message has been sent over 1 minute ago, we need to reset it back to false
    if (suppressed.isSuppressed && suppressed.date < (new Date().getTime() - 60000)) {
            suppressed.isSuppressed = false;
    }

    // Wait 10 seconds and then process the next message in the queue
    setTimeout(function() {
        processQueue();
    }, 10000);
}

// Start listening on the PM2 BUS
pm2.launchBus(function(err, bus) {

    // Listen for process logs
    if (conf.log) {
        bus.on('log:out', function(data) {
            if (data.process.name !== 'pm2-slack') {
                messages.push({
                    name: data.process.name,
                    event: 'log',
                    description: JSON.stringify(data.data),
                    timestamp: Math.floor(Date.now() / 1000),
                });
            }
        });
    }

    // Listen for process errors
    if (conf.error) {
        bus.on('log:err', function(data) {
            if (data.process.name !== 'pm2-slack') {
                messages.push({
                    name: data.process.name,
                    event: 'error',
                    description: JSON.stringify(data.data),
                    timestamp: Math.floor(Date.now() / 1000),
                });
            }
        });
    }

    // Listen for PM2 kill
    if (conf.kill) {
        bus.on('pm2:kill', function(data) {
            messages.push({
                name: 'PM2',
                event: 'kill',
                description: data.msg,
                timestamp: Math.floor(Date.now() / 1000),
            });
        });
    }

    // Listen for process exceptions
    if (conf.exception) {
        bus.on('process:exception', function(data) {
            if (data.process.name !== 'pm2-slack') {
                messages.push({
                    name: data.process.name,
                    event: 'exception',
                    description: JSON.stringify(data.data),
                    timestamp: Math.floor(Date.now() / 1000),
                });
            }
        });
    }

    // Listen for PM2 events
    bus.on('process:event', function(data) {
        if (conf[data.event]) {
            if (data.process.name !== 'pm2-slack') {
                messages.push({
                    name: data.process.name,
                    event: data.event,
                    description: 'The following event has occured on the PM2 process ' + data.process.name + ': ' + data.event,
                    timestamp: Math.floor(Date.now() / 1000),
                });
            }
        }
    });

    // Start the message processing
    processQueue();

});
