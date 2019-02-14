# node-ical
[![Build Status](https://travis-ci.org/jens-maus/node-ical.png)](https://travis-ci.org/jens-maus/node-ical)
[![NPM version](http://img.shields.io/npm/v/node-ical.svg)](https://www.npmjs.com/package/node-ical)
[![Downloads](https://img.shields.io/npm/dm/node-ical.svg)](https://www.npmjs.com/package/node-ical)

[![NPM](https://nodei.co/npm/node-ical.png?downloads=true)](https://nodei.co/npm/node-ical/)

A minimal icalendar/ics (http://tools.ietf.org/html/rfc5545) parser for nodejs. This modul is a direct fork
of the ical.js module by Peter Braden (https://github.com/peterbraden/ical.js) which is primarily targeted
for allowing to parse icalender/ics files in pure javascript, thus within the browser itself. This node-ical
module, however, primarily targets nodejs use which should allow to parse icalendar/ics files in a more flexible
way.

## Install
node-ical is availble on npm:

    npm install node-ical

## API
Parses a string with ICS content synchronous. This can block the nodejs event loop on big files
```js
var ical = require('node-ical');
ical.parseICS(str);
```

Parses a string with ICS content asynchronous to prevent event loop from being blocked.
```js
var ical = require('node-ical');
ical.parseICS(str, function(err, data) {
    if (err) console.log(err);
    console.log(data);
});
```

Parses a string with an ICS File synchronous. This can block the nodejs event loop on big files
```js
var data = ical.parseFile(filename);
```

Parses a string with an ICS File asynchronous to prevent event loop from being blocked.
```js
var data = ical.parseFile(filename, function(err, data) {
    if (err) console.log(err);
    console.log(data);
});
```

Reads in the specified iCal file, parses it and returns the parsed data. This method always work asynchronous
```js
ical.fromURL(url, options, function(err, data) {
    if (err) console.log(err);
    console.log(data);
});
```

Use the request library to fetch the specified URL (```opts``` gets passed on to the ```request()``` call), and call the function with the result (either an error or the data).

## Example 1 - Print list of upcoming node conferences (see example.js) (parses the file synchronous)
```js
var ical = require('node-ical');
var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

ical.fromURL('http://lanyrd.com/topics/nodejs/nodejs.ics', {}, function(err, data) {
  for (var k in data){
    if (data.hasOwnProperty(k)) {
      var ev = data[k];
      console.log("Conference",
        ev.summary,
        'is in',
        ev.location,
        'on the', ev.start.getDate(), 'of', months[ev.start.getMonth()]);
    }
  }
});
```
