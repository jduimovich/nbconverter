var fs = require('fs');

var args = process.argv.splice(2);

if (args.length != 1) {
    console.log("You must pass a file name to convert as the first parameter.");
    console.log("Usage:", process.argv[0], " csv-filename");
    process.exit(0);
}

// no longer need to merge this file, as the new csv format 
// var existingMapDataFile = "mapdata.json";

var inputfile = args[0];
var outputfile = "mapdata.xml";
var logfile = outputfile + '.log';
var autolatlong = "autolatlong.json";
var manuallatlong = "manuallatlong.json";

console.log("Input File ", inputfile);
console.log("Outputfile File ", outputfile);
console.log("Logfile File ", logfile);
console.log("autolatlong File ", autolatlong);
console.log("manuallatlong File ", manuallatlong);

var map = new Map();
var nameToId = new Map();
var Converter = require("csvtojson").Converter;
var converter = new Converter({});
var missingCount = 0;

function xmlit(tag, content) {
    var c = (content ? content.replace(/&/g, '&amp;') : "");
    return "    <" + tag + ">" + c + "</" + tag + ">";
}

var noNBDataExpected = {
    "gardens": ['icon', 'farmtype', "favorites"],
    "foodservices": ['icon', 'farmtype', "favorites"],
    "producer": ['icon']
}

function generateTag(obj, xmlField, nationBuilderFieldOrFunction) {
    var nationbuilderdata = "";
    if (typeof nationBuilderFieldOrFunction == 'function') {
        nationbuilderdata = nationBuilderFieldOrFunction(obj);
    } else {
        nationbuilderdata = obj[nationBuilderFieldOrFunction]; 
    }
     
    if (nationbuilderdata == undefined) {
        var nbid = obj.nationbuilder_id;
        nationbuilderdata = "";
    }
    // if (msg) {
    //     if (obj.showHeader) {
    //         log(String(missingCount++) + ": " + header);
    //         obj.showHeader = false;
    //     }
    //     log("   " + msg);
    // }
    return xmlit(xmlField, nationbuilderdata);
}

var outputLines = [];

function output(line) {
    outputLines.push(line);
}

var logoutput = [];

function log(line) {
    logoutput.push(line);
}

function outputXML() {
    console.log("Creating: ", outputfile);
    var stream = fs.createWriteStream(outputfile);
    stream.once('open', function(fd) {
        stream.write("");
        stream.write('<?xml version="1.0" encoding="UTF-8"?>');
        stream.write('<?xml-stylesheet type="text/xsl" href="mapdata.xsl"?>');
        stream.write("<markers>");

        for (var i = 0; i < outputLines.length; i++) {
            stream.write(outputLines[i]);
        }
        stream.write("</markers>");
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

function getOrgType(entry) {
    // Basis for choosing map icon (need an icon for each of these maptypes)
    // 1 row in csv file can be 1 or more of the following:
    // foodservice, producer, retailer, market, microprocessor, breweries_and_wineries
    if (entry.retailers) {
        return "retailers";
    } else if (entry.markets) {
        return "markets";
    } else if (entry.foodservice) {
        return "foodservice";
    } else if (entry.microprocessor) {
        return "microprocessor";
    } else if (entry.breweries_and_wineries) {
        return "breweries_and_wineries";
    } 
    return "producer";
}

function getFarmType(entry) {  
    // applies to producers, 1 or more: csa, pick-your-own
    var farmtype = "";
    if (entry.pick_your_own == 'true') {
        farmtype = farmtype + ",pick_your_own";
    } else if (entry.csa == 'true') {
        farmtype = farmtype + ",pick_your_own";
    }
    return farmtype.substring(1); 
}

function getProductsList(entry) {
    // if maptype is producer, they can produce 0 or more of the following products:
    // fruits, vegetables, grains_seeds, meat, poultry_eggs, sweeteners, herb_grower
    var products = "";
    if (entry.vegetables == 'true') {
        products = products + ",fv-vegetables"
    } 
    if (entry.fruits == 'true') {
        products = products + ",fv-fruits"
    }  
    if (entry.grains_seeds == 'true') {
        products = products + ",fv-grains_seeds"
    }  
    if (entry.meat == 'true') {
        products = products + ",fm-meat"
    }  
    if (entry.poultry_eggs == 'true') {
        products = products + ",fm-poultry_eggs"
    }  
    if (entry.sweeteners == 'true') {
        products = products + ",fv-sweeteners"
    }  
    if (entry.herb_grower == 'true') {
        products = products + ",fv-herbs"
    } 
    return products.substring(1); 
}

function getProductionPractice(entry) {
    // if maptype is producer, 1 row in csv file can only be 1 of the following:
    // eco, cert_org, conventional
    if (entry.certified_organic == 'true') {
        return "certified_organic";
    } else if (entry.self_identified_ecological_practises == 'true') {
        return "self_identified_ecological";
    } 
    return "conventional";
}

function getPurchaseType(entry) {
    // buyonline, farmstand, 0 or more
    // this information was not previously available buyonline applies to all maptypes
    var purchaseType = "";

    if (entry.buy_online == 'true') {
        purchaseType = purchaseType + ",buy_online";
    }
    if (entry.farm_stand == 'true') {
        purchaseType = purchaseType + ",farm_stand";
    }
    return purchaseType.substring(1); 
}

function getSOMembership(entry) {
    if (entry.membership == 'true') {
        return true;
    }
    return false;
}

function getFullAddress(entry, delimiter) {
    var fullAddress = "";
    if (entry.primary_address1) {
        fullAddress = fullAddress + entry.primary_address1 + delimiter;
    }
    if (entry.primary_city) {
        fullAddress = fullAddress + entry.primary_city + delimiter;
    }
    if (entry.primary_state) {
        fullAddress = fullAddress + entry.primary_state + delimiter;
    }
    if (entry.primary_country_code) {
        fullAddress = fullAddress + entry.primary_country_code + delimiter;
    }
    if (entry.primary_zip) {
        fullAddress = fullAddress + entry.primary_zip;
    }
    return fullAddress;
}

function getInfoWindow(entry) {
    var details = "<![CDATA[";
    if (entry.full_name) {
        details = details + "name: " + entry.full_name;
    }
    details = details + getFullAddress(entry, ", ");
    if (entry.email) {
        details = details + "\nemail: " + entry.email;
    }
    if (entry.website) {
        details = details + "\nwebsite: " + entry.website;
    }
    if (entry.phone_number) {
        details = details + "\nphone: " + entry.phone_number;
    }
    if (entry.twitter_login) {
        details = details + "\ntwitter: " + entry.twitter_login;
    }
    details = details + "]]>";
    return details;
}

var xmlTagToNBName = {
    "name": "full_name",
    "nbid": "nationbuilder_id",
    "lat": "lat",
    "lng": "lng",
    "orgtype": getOrgType,  
    "savour": getSOMembership,  
    "farmtypes": getFarmType, 
    "favorites": getProductsList, 
    "productiontypes": getProductionPractice, 
    "purchasetypes": getPurchaseType,  
    "infowindow": getInfoWindow, 
    "email": "email",
    "website": "website",
    "icon": "icon"  
};

var content = fs.readFileSync(autolatlong);
var latlongmap = JSON.parse(content);
var content = fs.readFileSync(manuallatlong);
var manlatlongmap = JSON.parse(content);
for (var field in manlatlongmap) { latlongmap[field] = manlatlongmap[field]; }

converter.fromFile(inputfile, function(err, jsonArray) {
    for (var i = 0, l = jsonArray.length; i < l; i++) {
        var obj = jsonArray[i];
        output("<marker>");
        var xmltags = Object.keys(xmlTagToNBName);
        obj.showHeader = true;

        var existing = latlongmap[String(obj.nationbuilder_id)];
        if (existing) {
            console.log("Using Existing lat/lng for NBID ", obj.nationbuilder_id, existing)
            if (existing.lat) {
                obj['lat'] = existing.lat;
            }
            if (existing.lng) {
                obj['lng'] = existing.lng;
            }
        } else {
            console.log("No Known LAT for NBID ", obj.nationbuilder_id)
        }


        xmltags.forEach(function callback(xmlkey, index, array) {
            output(generateTag(obj, xmlkey, xmlTagToNBName[xmlkey]));
        });
        output("</marker>\n");
    }
    outputXML();
    outputLog();
});