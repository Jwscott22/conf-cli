#!/usr/bin/env node --harmony
/**
 * Created by stephen on 20/01/2017.
 */
var fs = require('fs');
var co = require('co');
var prompt = require('co-prompt');
var program = require('commander');
var request = require('superagent');
var url = require('url');
var util = require('util');
var jsdom = require('jsdom');

program
    .version('1.0.2')
    .arguments('<page>')
    .option('-u, --user [user]', 'The user to authentiacte as [optional]')
    .option('-p, --password [password]', 'The user\'s password [optional]')
    .option('-U, --url <url>', 'The base URL for Confluence')
    .option('-s, --space [space]', 'The space to search')
    .action(function (page)
    {
        co(function *()
        {
            if (!program.url)
            {
                console.log('No host name provided, please add -U and the base URL for Confluence.');
                return;
            }
            if (!program.url.startsWith('http')) program.url = 'http://' + program.url;
            var urlObj = url.parse(program.url);
            var options = {};

            urlObj.protocol = 'http';
            options.user = program.user;
            options.password = '';
            if (options.user)
            {
                //noinspection JSUnresolvedVariable,JSAnnotator
                options.password = program.password || (yield prompt.password('Password:'));
                urlObj.auth = options.user + ':' + options.password;
                urlObj.protocol = 'https';
            }
            options.host = url.format(urlObj);
            options.page = page.replace(' ', '+');
            options.space = program.space || null;
            options.fileName = page.replace(' ', '_');

            options.host = options.host.replace(/\/$/m, '');

            if (options.space)
            {
                options.url = options.host + '/rest/api/content/search?cql=(space=' + options.space + '%20AND%20title=%27' + options.page + '%27)&expand=body.view';
            } else
            {
                options.url = options.host + '/rest/api/content/search?cql=(title=%27' + options.page + '%27)&expand=body.view';
            }
            //noinspection JSUnresolvedVariable
            console.log('Looking up page: ' + options.url);
            request
                .get(options.url)
                .set('Accept', 'application/json')
                //.auth(options.user, options.password)
                .end(function getPage(err, res)
                {
                    //console.log(err);
                    if (err && err.code)
                    {
                        console.log(err.toString());
                    }

                    if (res && res.body && res.body.results && res.body.results[0])
                    {
                        options.pageId = res.body.results[0].id;
                        console.log('Working with page ID ' + options.pageId);
                    }
                    else if (res && res.statusCode !== 200)
                    {
                        if (res)
                        {
                            console.log(res.statusCode + ': ' + err);
                        }
                        return;
                    }
                    else
                    {
                        console.log('Error: no page returned.');
                        console.log('URL: ' + options.url);
                        //console.log(res);
                        return;
                    }

                    if (!fs.existsSync('./documentation'))
                    {
                        fs.mkdirSync('./documentation');
                    }
                    var view = res.body.results[0].body.view.value;
                    buildPage(options, view);
                    console.log('Building page in: ./documentation');
                });
        });
    })
    .parse(process.argv);

/**
 * Pull the list of images in a page
 * @param options [object] - An options object with url etc.
 * @param fileName [string] - The name of the file to download
 */
function getFile(options, fileName)
{
    var url = options.host + '/rest/api/content/' + options.pageId + '/child/attachment';
    url = url + '?filename=' + fileName.replace(/\?$/m, '');
    console.log('File URL:' + url);

    request
        .get(url)
        .set('Accept', 'application/json')
        .end(function files(err, res)
        {
            if (res.body && res.body.results)
            {
                //console.log(res.body.results);
                res.body.results.forEach(function (fileEntry)
                {
                    console.log('Download file:' + fileEntry._links.download);
                    downloadFile(options, fileEntry._links.download);
                });
            }
        });
}

function cleanFileName(filePath) {
    var trueFileName;
    trueFileName = String(filePath.match(/[^\/]+?\.\w+\?/i));
    trueFileName = trueFileName.replace(/%20/g, '_').replace(/\?$/m, '');
    return trueFileName.replace(/%[\dA-F][\dA-F]/g, '');
}
/**
 * Download the png images and files from a page
 * @param options [object] - An options object with url etc.
 * @param fileName [string] - The filename to use in the downlaod and save
 */
function downloadFile(options, fileName)
{
    var downloadName;
    var fileExt;
    var theFile;
    var req;

    //console.log('Download '+options.host+fileName);
    if (fileName.match(/[^\/]+?\.\w+\?/i))
    {
        downloadName = cleanFileName(fileName);

        fileExt = String(downloadName.match(/\.\w+$/im)).toLowerCase();

        if (fileExt === '.png' || fileExt === '.jpg')
        {
            if (!fs.existsSync('./documentation/images/'))
            {
                fs.mkdirSync('./documentation/images/');
            }
            theFile = fs.createWriteStream('./documentation/images/' + downloadName);
        }
        else
        {
            if (!fs.existsSync('./documentation/files/'))
            {
                fs.mkdirSync('./documentation/files/');
            }
            theFile = fs.createWriteStream('./documentation/files/' + downloadName);
        }
        req = request.get(options.host + fileName);
        req.pipe(theFile);

    }
    else
    {
        // It is a file of some other type
        console.log('Can\'t understand the filename ' + fileName + ' not downloaded.');
    }
}

/**
 * Cleans various style and other tag data out of the html
 * @param html [string] - The original html to process
 * @returns {string|*} - The cleaned up html
 */
function cleanHTML(html)
{
    var reScrS = /<script[\S\s]+?CDATA\[/ig;
    var reScrE = /\]\]><\/script>/ig;
    // First some basic cleaning

    html = html.replace("On this page:", "");
    // html = html.replace(/<a href="#/g, '<a href="http://docs.moogsoft.com/display/MOOG/REST+LAM#');
    // html = html.replace(/<a href="\/display/g, '<a href="http://docs.moogsoft.com/display');
    // html = html.replace(/data-image-src="\/download/g, 'data-image-src"http://docs.moogsoft.com/download');
    // html = html.replace(/src="\/download/g, 'src"http://docs.moogsoft.com/download');
    html = html.replace(/href=/g, 'target=_blank href=');

    html = html.replace(reScrS, '<pre>');
    html = html.replace(reScrE, '</pre>');

    return html;
}

/**
 * Build the page html and update the images with the correct path
 * @param options [object] - An options object with url etc.
 * @param pageHtml [string] - The original page html
 */
function buildPage(options, pageHtml)
{
    var reSp = /<span class="confluence-embedded-file-wrapper[\s\S]+?[\s\S]+?<\/span>?/g;
    var reHref = /<a href=\"\/download\/attachments[\s\S]+?\>/g;
    var reWH = /(height|width)\S+/ig;
    var spans = pageHtml.match(reSp);
    var hrefs = pageHtml.match(reHref);
    var hw;
    var fileName;
    var tag;

    if (spans)
    {
        spans.forEach(function (span)
        {
            hw = span.match(reWH);
            if (hw)
            {
                fileName = String(span.match(/[^\/]+?\.\w+\?/i));
                getFile(options, fileName);
                fileName = cleanFileName(fileName);

                fileExt = String(fileName.match(/\.\w+$/im)).toLowerCase();

                if (fileExt === '.png' || fileExt === '.jpg')
                {
                    tag = '<img ' + hw[0] + ' ' + hw[1] + ' src="./images/' + fileName + '">';
                    pageHtml = pageHtml.replace(span, tag);
                }

                //console.log(String(span) + ' <-> '+tag);
            }
        });
    }
    if (hrefs)
    {
        hrefs.forEach(function (href)
        {
            fileName = String(href.match(/[^\/]+?\.\w+\?/i));
            getFile(options, fileName);
            fileName = cleanFileName(fileName);

            fileExt = String(fileName.match(/\.\w+$/im)).toLowerCase();

            tag = '<a href="./files/' + fileName + '">';
            pageHtml = pageHtml.replace(href, tag);

            //console.log(String(href) + ' <-> ' + tag);
        })
    }

    pageHtml = cleanHTML(pageHtml);

    //console.log('**HTML '+pageHtml);
    fs.writeFileSync('./documentation/' + options.fileName + '_docs.html', pageHtml);
}