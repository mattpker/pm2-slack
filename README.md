# pm2-slack

This is a PM2 Module for sending events & logs from your PM2 processes to Slack.

## Install

To install and setup pm2-slack, run the following commands:

```
pm2 install pm2-slack
pm2 set pm2-slack:slack_url https://slack_url
```

To get the Slack URL, you need to setup an Incoming Webhook. More details on how to set this up can be found here: https://api.slack.com/incoming-webhooks

## Configure

The following events can be subscribed to:

- log - All standard out logs from your processes. Default: false
- error - All error logs from your processes. Default: true
- kill - Event fired when PM2 is killed. Default: true
- exception - Any exceptions from your processes. Default: true
- restart - Event fired when a process is restarted. Default: false
- reload - Event fired when a cluster is reloaded. Default: false
- delete - Event fired when a process is removed from PM2. Default: false
- stop - Event fired when a process is stopped. Default: false
- restart overlimit - Event fired when a process is reaches the max amount of times it can restart. Default: true
- exit - Event fired when a process is exited. Default: false
- start -  Event fired when a process is started. Default: false
- online - Event fired when a process is online. Default: false

You can simply turn these on and off by setting them to true or false using the PM2 set command.

```
pm2 set pm2-slack:log true
pm2 set pm2-slack:error false
```

## Options

The following options are available:

- username (string) - Set the username used in Slack for posting the message. By default this is the hostname of the server.
- buffer (bool) - Enable/Disable buffering of messages. Messages that occur in short time will be concatenated together and posted as a single slack message. Default: true
- buffer_seconds (int) - If buffering is enables, all messages are stored for this interval. If no new messages comes in this interval, buffered message(s) are sended to Slack. If new message comes in this interval, the "timer" will be reseted and buffer starts waiting for the new interval for a new next message. *Note: Puspose is reduction of push notifications on Slack clients.* Default: 2
- buffer_max_seconds (int) - If time exceed this time, the buffered messages are always sent to Slack, even if new messages are still comming in interval (property `buffer_seconds`). Default: 20
- queue_max (int) - Maximum number of messages, that can be send in one Slack message (in one bufferring round). When the queue exceeds this maximum, next messages are suppresesed and replaced with message "`Next XX messages have been suppressed.`". Default: 100

Set these options in the same way you subscribe to events.

Example: The following configuration options will enable message buffering, and set the buffer duration to 5 seconds. All messages that occur within maximum 5 seconds delay between two neighboring messages will be concatenated into a single slack message.

```
pm2 set pm2-slack:username pm2-user
pm2 set pm2-slack:buffer_seconds 5
```

Note: In this example, the maximum total delay for messages is still 20 seconds (default value for `buffer_max_seconds`). After this time, the buffer will be flushed
everytime and all messages will be sent.


## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code.

## Release History
- 1.0.0 Message bufferring refactored. Message grouping refactored.
        Added datetime parsing from log messages.
- 0.3.4 Added an option to override the Slack username
- 0.3.3 Added documentation for the reload event
- 0.3.2 Fixed Half width of error and log messages (thanks @ma-zal)
- 0.3.1 Fixed Double escaping of error and log messages (thanks @ma-zal)
- 0.3.0 Switched to a default buffer system that groups alike messages by timestamp in the same message to Slack (thanks @kjhangiani)
- 0.2.0 Implemented a rate limiting system and updated all the dependencies
- 0.1.1 Commenting & Clean up
- 0.1.0 Initial Release
