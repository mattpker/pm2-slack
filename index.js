'use strict';

var os = require('os');
var pm2 = require('pm2');
var pmx = require('pmx');
var request = require('request');

// Get the configuration from PM2
var conf = pmx.initModule();

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

// Function to process the message queue
function processQueue() {

    // If we have a message in the message queue, removed it from the queue and send it to slack
    if (messages.length > 0) {
        sendSlack(messages.shift());
    }

    // If there are over 10 messages in the queue, send the suppression message if it has not been sent and delete all the messages in the queue after 10
    if (messages.length > 10) {
        if (!suppressed.isSuppressed) {
            suppressed.isSuppressed = true;
            suppressed.date = new Date().getTime();
            sendSlack({
                name: 'pm2-slack',
                event: 'suppressed',
                description: 'Messages are being suppressed due to rate limiting.'
            });
        }
        messages.splice(10, messages.length);
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
                    description: JSON.stringify(data.data)
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
                    description: JSON.stringify(data.data)
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
                description: data.msg
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
                    description: JSON.stringify(data.data)
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
                    description: 'The following event has occured on the PM2 process ' + data.process.name + ': ' + data.event
                });
            }
        }
    });

    // Start the message processing
    processQueue();

});
