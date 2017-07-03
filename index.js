'use strict';

// Dependency
var os = require('os');
var pm2 = require('pm2');
var pmx = require('pmx');
var request = require('request');
var scheduler = require('./scheduler');


// Get the configuration from PM2
var conf = pmx.initModule();

// The events that will trigger the color red
var redEvents = ['stop', 'exit', 'delete', 'error', 'kill', 'exception', 'restart overlimit', 'suppressed'];
var redColor = '#F44336';
var commonColor = '#2196F3';

// create the message queue
var globalMessageQueue = [];


/**
 * Sends immediately the message(s) to Slack's Incoming Webhook.
 * 
 * @param {Message[]) messages - List of messages, ready to send.
 *                              This list can be trimmed and concated base on module configuration.
 */
function sendToSlack(messages) {

    // If a Slack URL is not set, we do not want to continue and nofify the user that it needs to be set
    if (!conf.slack_url) {
        return console.error("There is no Slack URL set, please set the Slack URL: 'pm2 set pm2-slack:slack_url https://slack_url'");
    }

    var limitedCountOfMessages;
    if (conf.queue_max > 0) {
        // Limit count of messages for sending
        limitedCountOfMessages = messages.splice(0, Math.min(conf.queue_max, messages.length));
    } else {
        // Select all messages for sending
        limitedCountOfMessages = messages;
    }

    // The JSON payload to send to the Webhook
    var payload = {
        username: conf.servername || os.hostname(),
        attachments: []
    };


    // Merge together all messages from same process and with same event 
    // Convert messages to Slack message's attachments
    payload.attachments = convertMessagesToSlackAttachments(mergeSimilarMessages(limitedCountOfMessages));
    
    // Because Slack`s notification text displays the fallback text of first attachment only,
    // add list of message types to better overview about complex message in mobile notifications.
    
    if (payload.attachments.length > 1) {
        payload.text = payload.attachments
            .map(function(/*SlackAttachment*/ attachment) { return attachment.title; })
            .join(", ");
    }

    // Group together all messages with same title. 
    // payload.attachments = groupSameSlackAttachmentTypes(payload.attachments);

    // Add warning, if some messages has been suppresed
    if (messages.length > 0) {
        var text = 'Next ' + messages.length + ' message' + (messages.length > 1 ? 's have ' : ' has ') + 'been suppressed.';
        payload.attachments.push({
            fallback: text,
            // color: redColor,
            title: 'message rate limitation',
            text: text,
            ts: Math.floor(Date.now() / 1000),
        });
    }
    
    // Options for the post request
    var requestOptions = {
        method: 'post',
        body: payload,
        json: true,
        url: conf.slack_url,
    };

    // Finally, make the post request to the Slack Incoming Webhook
    request(requestOptions, function(err, res, body) {
        if (err) return console.error(err);
        if (body !== 'ok') {
            console.error('Error sending notification to Slack, verify that the Slack URL for incoming webhooks is correct. ' + messages.length + ' unsended message(s) lost.');
        }
    });
}


/**
 * Sends the message to Slack's Incoming Webhook.
 * If buffer is enabled, the message is added to queue and sending is postponed for couple of seconds.
 * 
 * @param {Message} message
 */
function scheduleSendToSlack(message) {
    if (!conf.buffer || !(conf.buffer_seconds > 0)) {
        // No sending buffer defined. Send directly to Slack.
        sendToSlack([message]);
    } else {
        // Add message to buffer
        globalMessageQueue.push(message);
        // Plan send the enqueued messages
        scheduler.schedule(function() {
            // Remove waiting messages from global queue
            const messagesToSend = globalMessageQueue.splice(0, globalMessageQueue.length);
            
            sendToSlack(messagesToSend);
        });
    }
}


/**
 * Converts messages to json format, that can be sent as Slack message's attachments.
 * 
 * @param {Message[]) messages
 * @returns {SlackAttachment[]}
 */
function convertMessagesToSlackAttachments(messages) {
    return messages.reduce(function(slackAttachments, message) {
    
        // The default color for events should be green
        var color = commonColor;
        // If the event is listed in redEvents, set the color to red
        if (redEvents.indexOf(message.event) > -1) {
            color = redColor;
        }
        
        var fallbackText = message.name + ' ' + message.event + (message.description ? ': ' + message.description.trim().replace(/[\r\n]+/g, ', ') : '');
        slackAttachments.push({
            fallback: escapeSlackText(fallbackText),
            color: color,
            title: escapeSlackText(message.name + ' ' + message.event),
            text: escapeSlackText(message.description ? message.description.trim() : ''),
            ts: message.timestamp,
            // footer: message.name, 
        });
        
        return slackAttachments;
    }, []);
}


/**
 * New PM2 is storing log messages with date in format "YYYY-MM-DD hh:mm:ss +-zz:zz"
 * Parses this date from begin of message
 * 
 * @param {string} logMessage
 * @returns {{description:string|null, timestamp:number|null}}
 */
function parseIncommingLog(logMessage) {
    var description = null;
    var timestamp = null;
    
    if (typeof logMessage === "string") {
        // Parse date on begin (if exists)
        var dateRegex = /([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{1,2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})? [+\-]?[0-9]{1,2}:[0-9]{2}(\.[0-9]{3})?)[:\-\s]+/;
        var parsedDescription = dateRegex.exec(logMessage);
        // Note: The `parsedDescription[0]` is datetime with separator(s) on the end.
        //       The `parsedDescription[1]` is datetime only (without separators). 
        //       The `parsedDescription[2]` are ".microseconds"
        if (parsedDescription && parsedDescription.length >= 2) {
            // Use timestamp from message
            timestamp = Math.floor(Date.parse(parsedDescription[1]) / 1000);
            // Use message without date
            description = logMessage.replace(parsedDescription[0], "");
        } else {
            // Use whole original message
            description = logMessage;
        }
    }
    
    return {
        description: description,
        timestamp: timestamp
    }
}


/**
 * Merge together all messages from same process and with same event
 * 
 * @param {Messages[]} messages
 * @returns {Messages[]}
 */
function mergeSimilarMessages(messages) {
    return messages.reduce(function(/*Message[]*/ finalMessages, /*Message*/ currentMessage) {
        if (finalMessages.length > 0
            && finalMessages[finalMessages.length-1].name === currentMessage.name
            && finalMessages[finalMessages.length-1].event === currentMessage.event
        ) {
            // Current message has same title as previous one. Concate it.
            finalMessages[finalMessages.length-1].description += "\n" + currentMessage.description;
        } else {
            // Current message is different than previous one.
            finalMessages.push(currentMessage);
        }
        return finalMessages;
    }, []);
}


// ----- APP INITIALIZATION -----

// Initialize buffer configuration from PM config variables
scheduler.config.buffer_seconds = Number.parseInt(conf.buffer_seconds); 
scheduler.config.buffer_max_seconds = Number.parseInt(conf.buffer_max_seconds); 

// Start listening on the PM2 BUS
pm2.launchBus(function(err, bus) {

    // Listen for process logs
    if (conf.log) {
        bus.on('log:out', function(data) {
            if (data.process.name !== 'pm2-slack') {
                var parsedLog = parseIncommingLog(data.data);
                scheduleSendToSlack({
                    name: data.process.name,
                    event: 'log',
                    description: parsedLog.description,
                    timestamp: parsedLog.timestamp,
                });
            }
        });
    }

    // Listen for process errors
    if (conf.error) {
        bus.on('log:err', function(data) {
            if (data.process.name !== 'pm2-slack') {
                var parsedLog = parseIncommingLog(data.data);
                scheduleSendToSlack({
                    name: data.process.name,
                    event: 'error',
                    description: parsedLog.description,
                    timestamp: parsedLog.timestamp,
                });
            }
        });
    }

    // Listen for PM2 kill
    if (conf.kill) {
        bus.on('pm2:kill', function(data) {
            scheduleSendToSlack({
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
                // If it is instance of Error, use it. If type is unknown, stringify it.
                var description = (data.data && data.data.message) ? (data.data.code || '') + data.data.message :  JSON.stringify(data.data);
                scheduleSendToSlack({
                    name: data.process.name,
                    event: 'exception',
                    description: description,
                    timestamp: Math.floor(Date.now() / 1000),
                });
            }
        });
    }

    // Listen for PM2 events
    bus.on('process:event', function(data) {
        if (conf[data.event]) {
            if (data.process.name !== 'pm2-slack') {
                var description = null;
                switch (data.event) {
                    case 'start':
                    case 'stop':
                    case 'restart':
                        description = null;
                        break;
                        
                    case 'restart overlimit':
                        description = 'Process has been stopped. Check and fix the issue.';
                        break;
                        
                }
                scheduleSendToSlack({
                    name: data.process.name,
                    event: data.event,
                    description: description,
                    timestamp: Math.floor(Date.now() / 1000),
                });
            }
        }
    });
});



/**
 * Escapes the plain text before sending to Slack's Incoming webhook.
 * @see https://api.slack.com/docs/message-formatting#how_to_escape_characters
 * 
 * @param {string} text
 * @returns {string}
 */
function escapeSlackText(text) {
    return (text || '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
}


/**
 * @typedef {Object} SlackAttachment
 * 
 * @property {string} fallback
 * @property {string} title
 * @property {string} [color]
 * @property {string} [text]
 * @property {number} ts - Linux timestamp format
 */


/**
 * @typedef {Object} Message
 *
 * @property {string} name
 * @property {string} event - `start`|`stop`|`restart`|`error`|`exception`|`restart overlimit`| ...
 * @property {string} description
 * @property {number} timestamp - Linux timestamp format
 */
