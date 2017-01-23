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

program
    .version('1.0.1')
    .arguments('<page>')
    .option('-u, --user [user]', 'The user to authentiacte as [optional]')
    .option('-p, --password [password]', 'The user\'s password [optional]')
    .option('-U, --url <url>', 'The base URL for Confluence')
    .action(function (page)
    {
        co(function *()
        {
            if (!program.url)
            {
                console.log('No host name provided, please add -U and the base URL for Confluence.');
                return;
            }
            var urlObj = url.parse(program.url);
            var options = {};
            options.user = program.user;
            options.password = '';
            if (options.user)
            {
                //noinspection JSUnresolvedVariable,JSAnnotator
                options.password = program.password || (yield prompt.password('Password:'));
                urlObj.auth = options.user + ':' + options.password;
            }
            options.host = url.format(urlObj);
            options.page = page.replace(' ', '+');
            options.fileName = page.replace(' ', '_');
            options.url = options.host + 'rest/api/content/search?cql=(title=%27' + options.page + '%27)&expand=body.view';
            //noinspection JSUnresolvedVariable
            console.log('Looking up page: ' + program.url + '/rest/api/content/search?cql=(title=%27' + options.page + '%27)&expand=body.view');
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
                        var pageId = res.body.results[0].id;
                    } else if (res && res.statusCode !== 200)
                    {
                        if (res)
                        {
                            console.log(res.statusCode + ': ' + err);
                        }
                        return;
                    } else
                    {
                        console.log('Error: no page returned.');
                        console.log('URL: ' + options.url);
                        //console.log(res);
                        return;
                    }
                    if (!fs.existsSync('./' + options.fileName))
                    {
                        fs.mkdirSync('./' + options.fileName);
                    }
                    var view = res.body.results[0].body.view.value;
                    buildPage(options, view);
                    console.log('Building page in: ' + options.fileName);
                    getImages(options, pageId);
                });
        });
    })
    .parse(process.argv);

/**
 * Pull the list of images in a page
 * @param options [object] - An options object with url etc.
 * @param pageId [string] - The page ID from Confluence
 */
function getImages(options, pageId)
{
    var url = options.host + 'rest/api/content/' + pageId + '/child/attachment';
    //console.log(options.host);
    request
        .get(url)
        .set('Accept', 'application/json')
        //.auth(options.user, options.password)
        .end(function images(err, res)
        {
            if (res.body && res.body.results)
            {
                res.body.results.forEach(function (imageEntry)
                {
                    //console.log(imageEntry._links.download);
                    downloadImg(options, imageEntry._links.download);
                });
            }
        });
}


/**
 * Download the png images from a page
 * @param options [object] - An options object with url etc.
 * @param imageFile [string] - The filename to use in the downlaod and save
 */
function downloadImg(options, imageFile)
{
    //console.log('Download '+options.host+imageFile);
    var imgName = String(imageFile.match(/[^\/]+?\.png\?/ig)[0]).replace(/\?$/m, '').replace(/%20/g, '_');
    //console.log(imgName);
    var imgFile = fs.createWriteStream('./' + options.fileName + '/' + imgName);
    var req = request(options.host + imageFile).accept('png');
    req.pipe(imgFile);
}


/**
 * Build the page html and update the images with the correct path
 * @param options [object] - An options object with url etc.
 * @param pageHtml [string] - The original page html
 */
function buildPage(options, pageHtml)
{
    var reSp = /<span class="confluence-embedded-file-wrapper[\s\S]+?[\s\S]+?<\/span>?/g;
    var reWH = /(height|width)\S+/ig;
    var reScrS = /<script[\S\s]+?CDATA\[/ig;
    var reScrE = /\]\]><\/script>/ig;
    var spans = pageHtml.match(reSp);
    var hw;
    var imagename;
    var img;

    spans.forEach(function (span)
    {
        hw = span.match(reWH);
        if (hw)
        {
            imagename = String(span.match(/[^\/]+?\.png\?/ig)[0]).replace(/\?$/m, '').replace(/%20/g, '_');
            img = '<img ' + hw[0] + ' ' + hw[1] + ' src="' + imagename + '">';
            pageHtml = pageHtml.replace(span, img);
            pageHtml = pageHtml.replace(reScrS,'<pre>');
            pageHtml = pageHtml.replace(reScrE, '</pre>');
            //console.log(String(span) + ' <-> '+img);
        }
    });
    //console.log('**HTML '+pageHtml);
    fs.writeFileSync('./' + options.fileName + '/' + options.fileName + '.html', pageHtml);
}