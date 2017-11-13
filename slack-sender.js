"use strict";


// Exports
module.exports = { sendToSlack };


// Dependency
const request = require('request');
const os = require('os');


// Constants
// The events that will trigger the color red
const redEvents = ['stop', 'exit', 'delete', 'error', 'kill', 'exception', 'restart overlimit', 'suppressed'];
const redColor = '#F44336';
const commonColor = '#2196F3';


/**
 * Sends immediately the message(s) to Slack's Incoming Webhook.
 *
 * @param {Message[]) messages - List of messages, ready to send.
 *                              This list can be trimmed and concated base on module configuration.
 */
function sendToSlack(messages, config) {

    // If a Slack URL is not set, we do not want to continue and nofify the user that it needs to be set
    if (!config.slack_url) {
        return console.error("There is no Slack URL set, please set the Slack URL: 'pm2 set pm2-slack:slack_url https://slack_url'");
    }

    let limitedCountOfMessages;
    if (config.queue_max > 0) {
        // Limit count of messages for sending
        limitedCountOfMessages = messages.splice(0, Math.min(config.queue_max, messages.length));
    } else {
        // Select all messages for sending
        limitedCountOfMessages = messages;
    }

    // The JSON payload to send to the Webhook
    let payload = {
        username: config.username || config.servername || os.hostname(),
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
        let text = 'Next ' + messages.length + ' message' + (messages.length > 1 ? 's have ' : ' has ') + 'been suppressed.';
        payload.attachments.push({
            fallback: text,
            // color: redColor,
            title: 'message rate limitation',
            text: text,
            ts: Math.floor(Date.now() / 1000),
        });
    }

    // Options for the post request
    const requestOptions = {
        method: 'post',
        body: payload,
        json: true,
        url: config.slack_url,
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

        var title = `${message.name} ${message.event}`;
        var description = (message.description || '').trim();
        var fallbackText = title + (description ? ': ' + description.replace(/[\r\n]+/g, ', ') : '');
        slackAttachments.push({
            fallback: escapeSlackText(fallbackText),
            color: color,
            title: escapeSlackText(title),
            text: escapeSlackText(description),
            ts: message.timestamp,
            // footer: message.name,
        });

        return slackAttachments;
    }, []);
}


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
