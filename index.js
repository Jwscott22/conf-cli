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

var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;

program
  .version('1.0.7')
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
      options.fileName = page.replace(/ /g, '_');

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

function cleanFileName(filePath)
{
  var trueFileName;
  trueFileName = String(filePath.match(/[^\/]+?\.\w+\?/i));
  trueFileName = trueFileName.replace(/(%20| )/g, '_').replace(/\?$/m, '');
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

  console.log('Download file:' + fileName);

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
  var reScrE = /]]><\/script>/ig;
  // First some basic cleaning

  html = html.replace("On this page:", "");
  html = html.replace(/href=/g, 'target=_blank href=');

  html = html.replace(reScrS, '<pre>');
  html = html.replace(reScrE, '</pre>');

  //
  // Remove any inlined styles
  //
  // 1. Wrap HTML in a div with a predefined class (styling purposes on UI)
  // 2. Parse HTML to DOM
  // 3. Remove style attribute
  // 4. Parse back to HTML
  //
  // TODO: Make this substitute wrap class a command line option
  html = '<div class="moog-confluence-data-wrap">' + html + '</div>';

  var parser = new DOMParser();
  var dom = parser.parseFromString(html, 'text/html');

  //
  // iterate over a tree of DOM nodes and remove any 'style' attributes
  //
  var fixTree = function (root)
  {

    if (root && typeof root.removeAttribute === 'function')
    {
      root.removeAttribute('style');
    }

    if (root.childNodes)
    {
      for (var i = 0; i < root.childNodes.length; i++)
      {
        fixTree(root.childNodes[i]);
      }
    }
  };

  fixTree(dom);

  var xmlSerializer = new XMLSerializer();
  html = xmlSerializer.serializeToString(dom);

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
  var reHref = /<a href="\/download\/attachments[\s\S]+?>/g;
  var reWH = /(height|width)\S+/ig;
  var reImg = /<img/ig;
  var spans = pageHtml.match(reSp);
  var hrefs = pageHtml.match(reHref);
  var hw, img;
  var fileName, fileExt, filePath;
  var tag;

  if (spans)
  {
    spans.forEach(function (span)
    {
      hw = span.match(reWH);
      img = span.match(reImg);
      //console.log('IMG Span? %s',span);
      if (img)
      {
        hw = hw ? hw : ['', ''];
        hw[1] = hw[1] ? hw[1] : '';
        fileName = String(span.match(/[^\/]+?\.\w+\?/i));
        filePath = span.match(/src=".*(\/download[\S\s]*?)"/im);
        //console.log('File: %s', filePath[1]);

        downloadFile(options, filePath[1]);
        fileName = cleanFileName(fileName);

        fileExt = String(fileName.match(/\.\w+$/im)).toLowerCase();

        if (fileExt === '.png' || fileExt === '.jpg')
        {
          tag = '<img ' + hw[0] + ' ' + hw[1] + ' src="./images/' + fileName + '">';
          //console.log('Tag: %s', tag);
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
      filePath = href.match(/href="([\S\s]*?)"/im);
      //console.log('HREF File: %s',filePath[1]);
      downloadFile(options, filePath[1]);

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