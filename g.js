var fs = require('fs');

var NodeGeocoder = require('node-geocoder');

var content = fs.readFileSync('cachedgoogle.json');
var cachedgoogle = JSON.parse(content);

content = fs.readFileSync('saved_autolatlong.json');
var autolatlong = JSON.parse(content);

function cachedGeocode(obj, callback) {
    if (cachedgoogle[obj]) {
        return callback(undefined, cachedgoogle[obj]);
    }
    return callback("Error no cache for " + obj, undefined);
}

var options = {
    provider: 'google',
    // Optional depending on the providers 
    httpAdapter: 'https', // Default 
    apiKey: process.env.NB_API_KEY, // for Mapquest, OpenCage, Google Premier 
    formatter: null // 'gpx', 'string', ... 
};

var geocoder = null;
if (process.env.NB_API_KEY) {
    console.log("API Key found, will attempt to geocode locations.")
    geocoder = NodeGeocoder(options);
} else {
    console.log("No API Key (NB_API_KEY) found, not attempting to geocode locations.")
    geocoder = new Object();
    geocoder.geocode = cachedGeocode;
}

var args = process.argv.splice(2);

if (args.length != 1) {
    console.log("You must pass a file name to find GPS coords as the first parameter.");
    console.log("Usage:", process.argv[0], " csv-filename");
    process.exit(0);
}

var inputfile = args[0];
var outputfile = "autolatlong.json";
var logfile = outputfile + '.log';

console.log("Input File ", inputfile);
console.log("Outputfile File ", outputfile);
console.log("Logfile File ", logfile);

var map = new Map();
var nameToId = new Map();
var Converter = require("csvtojson").Converter;
var converter = new Converter({});

var outputLines = [];

function output(line) {
    outputLines.push(line);
}
var logoutput = [];

function log(line) {
    logoutput.push(line);
}

function outputLatLong() {
    console.log("Creating: ", outputfile);
    var stream = fs.createWriteStream(outputfile);
    stream.once('open', function(fd) {

        stream.write("{\n");
        for (var i = 0; i < outputLines.length; i++) {
            stream.write('\n');
            stream.write(outputLines[i]);
            if (i != (outputLines.length - 1)) stream.write(',');
        }
        stream.write("}\n");
        stream.end();
    });
}

function outputLog() {
    console.log("Creating: ", logfile);
    var stream = fs.createWriteStream(logfile);
    stream.once('open', function(fd) {
        for (var i = 0; i < logoutput.length; i++) {
            stream.write(logoutput[i]);
            stream.write("\n");
        }
        stream.end();
    });
}

var failed = 0;
var success = 0;
var failedFiltered = 0;
var successFiltered = 0;

function printStats() {
    console.log("Geocoder Success Finding some Addresses for  = " + success);
    console.log("Geocoder Success to filtered(Canadian)Address for  = " + successFiltered);
    console.log("Geocoder Failed to filtered(Canadian)Address for  = " + failedFiltered);
    console.log("Geocoder Failed to find Any Address  = " + failed);
}

function getFullAddress(entry, delimiter) {
    var fullAddress = "";
    var delim = "";
    if (entry.primary_address1) {
        fullAddress = fullAddress + delim + entry.primary_address1;
        delim = delimiter;
    }
    if (entry.primary_city) {
        fullAddress = fullAddress + delim + entry.primary_city;
        delim = delimiter;
    }
    if (entry.primary_state) {
        fullAddress = fullAddress + delim + entry.primary_state;
        delim = delimiter;
    }
    if (entry.primary_country_code) {
        fullAddress = fullAddress + delim + entry.primary_country_code;
        delim = delimiter;
    }
    if (entry.primary_zip) {
        fullAddress = fullAddress + delim + entry.primary_zip;
    }
    return fullAddress;
}


function getGetcodeData(obj, lastCall) {
    var existingAutoLatLong = autolatlong[obj.nationbuilder_id];
    if (existingAutoLatLong) {
        log("Geocoder (autolatlong) " + obj.nationbuilder_id + JSON.stringify(existingAutoLatLong));
        output('"' + obj.nationbuilder_id + '" :' +
            JSON.stringify(existingAutoLatLong));

        lastCall();
        return;
    }
    var address = getFullAddress(obj, ", ");
    if (geocoder) {
        geocoder.geocode(address, function(err, res) {
            if (err) {
                log('Geocoder FAILED for NBID: ' + obj.nationbuilder_id + ' address->"' + address + '"');
                failed++;
            } else {
                success++;

                log('Geocoder Succeeded for NBID: ' + obj.nationbuilder_id + ' address->"' + address + '"');
                log(JSON.stringify(res));

                var filtered = res.filter(function(e) { return e.countryCode == 'CA' });
                if (filtered.length == 0) {
                    failedFiltered++;
                    log('Geocoder Failed (Canadian Address) for: "' + address + '"');
                } else {
                    successFiltered++;
                    var canadian = filtered[0];
                    // console.log(JSON.stringify(canadian));

                    log('Geocoder Succeeded (Canadian Address) for NBID: ' + obj.nationbuilder_id + ' address->"' + address + '"');
                    console.log("Geocoder Success for Canadian Address for  = ", address);
                    console.log("Geocoder Success CANADIAN NBID for  =", obj.nationbuilder_id);
                    var data = {
                        'lat': canadian.latitude,
                        'lng': canadian.longitude,
                        'fullAddress': address
                    }
                    output('"' + obj.nationbuilder_id + '" :' +
                        JSON.stringify(data));
                }
            }
            lastCall();
        });
    }
}

function allCallsDone() {
    outputLatLong();
    outputLog();
    printStats();
}
converter.fromFile(inputfile, function(err, jsonArray) {
    var callbacks = 0;
    var end = jsonArray.length;
    var cb = function() {
        callbacks++;
        if (callbacks == end) allCallsDone();
    }
    for (var i = 0, l = jsonArray.length; i < l; i++) {
        getGetcodeData(jsonArray[i], cb);
    }
});