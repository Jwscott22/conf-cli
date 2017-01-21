#!/usr/bin/env node --harmony
/**
 * Created by stephen on 20/01/2017.
 */
var fs = require('fs');
var co = require('co');
var prompt = require('co-prompt');
var program = require('commander');
var request = require('superagent');

program
    .arguments('<page>')
    .option('-u, --user <user>', 'The user to authentiacte as')
    .option('-p, --password <password>', 'The user\'s password')
    .option('-u, --url <host>', 'The base URL for Confluence')
    .action(function (page)
    {
        co(function *()
        {
            var options = {};
            options.user = program.user;
            options.password = '';
            if (options.user) {
                options.password = program.password || (yield prompt.password('Password:'));
            }
            options.host = program.host || 'http://localhost/';
            options.page = page.replace(' ', '+');
            options.url = options.host + '/rest/api/content/search?cql=(title=%27' + options.page + '%27)&expand=body.view';

            request
                .get(options.url)
                .set('Accept', 'application/json')
                .auth(options.user, options.password)
                .end(function getPage(err, res)
                {
                    //console.log(res);
                    var pageId = res.body.results[0].id;
                    if (!fs.existsSync('./' + pageId)) {
                        fs.mkdirSync('./' + pageId);
                    }
                    var view = res.body.results[0].body.view.value;
                    buildPage(view, pageId);
                    console.log('Building page in: ' + pageId);
                    getImages(options, pageId);
                });
        });
    })
    .parse(process.argv);

function getImages(options, pageId)
{
    var url = options.host + '/rest/api/content/' + pageId + '/child/attachment';
    var imgIdx = 0;
    //console.log(options.host);
    request
        .get(url)
        .set('Accept', 'application/json')
        .auth(options.user, options.password)
        .end(function images(err, res)
        {
            res.body.results.forEach(function (imageEntry)
            {
                //console.log(imageEntry._links.download);
                downloadImg(options, pageId, imageEntry._links.download);
            })
        })
}

function downloadImg(options, pageId, imageFile)
{
    //console.log('Download '+options.host+imageFile);
    var imgName = String(imageFile.match(/[^\/]+?\.png\?/ig)[0]).replace(/\?$/m, '').replace(/%20/g, '_');
    //console.log(imgName);
    var imgFile = fs.createWriteStream('./' + pageId + '/' + imgName);
    var req = request(options.host + imageFile).accept('png').auth(options.user, options.password);
    req.pipe(imgFile);
}

function buildPage(pageHtml, pageId)
{
    var reSp = /<span class="confluence-embedded-file-wrapper[\s\S]+?[\s\S]+?<\/span>?/g;
    var reWH = /(height|width)\S+/ig;
    var spans = pageHtml.match(reSp);
    var hw;
    var img;

    spans.forEach(function (span)
    {
        hw = span.match(reWH);
        imagename = String(span.match(/[^\/]+?\.png\?/ig)[0]).replace(/\?$/m, '').replace(/%20/g, '_');
        img = '<img ' + hw[0] + ' ' + hw[1] + ' src="' + imagename + '">';
        pageHtml = pageHtml.replace(span, img);
        //console.log(String(span) + ' <-> '+img);
    });
    //console.log('**HTML '+pageHtml);
    fs.writeFileSync('./' + pageId + '/' + pageId + '.html', pageHtml);
}