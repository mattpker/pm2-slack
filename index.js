'use strict';

var os = require('os');
var pm2 = require('pm2');
var pmx = require('pmx');
var request = require('request');

var conf = pmx.initModule();

var redEvents = ['stop', 'exit', 'delete', 'error', 'kill', 'exception', 'restart overlimit'];

function sendSlack(name, event, description) {

    if (!conf.slack_url) return console.error("There is no Slack URL set, please set the Slack URL: 'pm2 set pm2-slack:slack_url https://slack_url'");

    var color = '#008E00';
    if (redEvents.indexOf(event) > -1) {
        color = '#D00000';
    }

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

    var options = {
        method: 'post',
        body: payload,
        json: true,
        url: conf.slack_url
    };

    request(options, function(err, res, body) {
        if (err) return console.error(err);
        if (body !== 'ok') {
            console.error('Error sending notification to Slack, verify that the Slack URL for incoming webhooks is correct.');
        }
    });
}


pm2.launchBus(function(err, bus) {

    if (conf.log) {
        bus.on('log:out', function(data) {
            if (data.process.name !== 'pm2-slack') {
                sendSlack(data.process.name, 'log', JSON.stringify(data.data));
            }
        });
    }

    if (conf.error) {
        bus.on('log:err', function(data) {
            if (data.process.name !== 'pm2-slack') {
                sendSlack(data.process.name, 'error', JSON.stringify(data.data));
            }
        });
    }

    if (conf.kill) {
        bus.on('pm2:kill', function(data) {
            sendSlack('PM2', 'kill', data.msg);
        });
    }

    if (conf.exception) {
        bus.on('process:exception', function(data) {
            if (data.process.name !== 'pm2-slack') {
                sendSlack(data.process.name, 'exception', JSON.stringify(data.data));
            }
        });
    }

    bus.on('process:event', function(data) {
        if (conf[data.event]) {
            if (data.process.name !== 'pm2-slack') {
                sendSlack(data.process.name, data.event, 'The following event has occured on the PM2 process ' + data.process.name + ': ' + data.event);
            }
        }
    });

});
