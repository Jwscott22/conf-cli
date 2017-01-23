#conf-cli

##Overview

Small utility to pull a page from Confluence and build a local html with local images.

Only supports .png 

Command line only.

  Usage: conf-cli [options] page

  Options:

    -h, --help                 output usage information
    -V, --version              output the version number
    -u, --user [user]          The user to authentiacte as [optional]
    -p, --password [password]  The user's password [optional]
    -U, --url <url>            The base URL for Confluence

The page is a search term use quotes if the page name has spaces.
optional user and password, leave blank if not required.

The base url is in the form http://confluencehost.tld

Example:

 `conf-cli -u myuser -p mypass -h http://docs.myco.com 'conf-cli utility'`
 
Outputs the page html and images in a subdirectory named after the page ID in confluence.

##Installation

Download and from the directory with the package.json run.

`npm install`

Link to a directory on your path if requred, or run localy with ./

##Licence

(c) 2017 Moogsoft Inc. Licence MIT, see LICENCE.