const cheerio = require('cheerio');
const fs = require('fs');
const rp = require('request-promise');

const MAIN_URL = 'https://mangakisa.com';
const argv = process.argv;
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);

let DOWNLOAD_DIR = '';
let downloaded = 0;

async function getManga(keyword, min, max) {
	let res = await rp(MAIN_URL + '/search?q=' + keyword);
	let arr = [];
	if (res) {
		let $ = cheerio.load(res);
		$('.an').each(function(index) {
			const url = $(this).attr('href');
			const title = $(this).find('.similardd').text();
			if (keyword.toUpperCase() == title.toUpperCase()) {
				crawlManga(url, min, max);
				arr = [ `Keyword Match:  ${keyword} -> ${title}` ];
				return false;
			}
			arr.push({ title, url });
		});
	}
	console.log(arr);
	return arr;
}

async function getChapters(url, min = 0, max = 99999, fromCrawl = false) {
	if (!url.includes(MAIN_URL)) {
		url = MAIN_URL + url;
	}
	let res = await rp(url);
	let arr = [];

	if (res) {
		let $ = cheerio.load(res);
		DOWNLOAD_DIR = $('h1.infodes').text();
		$('div.infoepbox > .infovan').each(function(index) {
			const url = MAIN_URL + '/' + $(this).attr('href');

			const chapter = $(this).find('.infoept2 .centerv').text();
			if (Number(chapter) >= min && Number(chapter) <= max) arr.push({ chapter, url });
		});
	}
	if (Number(arr[0].chapter > Number(arr[arr.length - 1].chapter))) {
		arr.reverse();
	}
	if (!fromCrawl) {
		console.log(arr);
	}
	return arr;
}

async function getImages(url, chapter) {
	let res = await rp(url);
	let arr = [];

	if (res) {
		let $ = cheerio.load(res);
		$('div.div_beforeImage').each(function(index) {
			const link = $(this).find('img').attr('src');
			const id = $(this).attr('id').split('-')[1];
			const dir = `chapter-${chapter}`;
			arr.push({ link, id, dir });
		});
	}
	return arr;
}

async function download(img) {
	let filename = `./manga/${DOWNLOAD_DIR}/${img.dir}-${img.id}.jpg`;
	let res = await rp({
		encoding: 'binary',
		uri: img.link,
		resolveWithFullResponse: true
	}).catch((err) => console.log(err));
	if (res) {
		!fs.existsSync(`./manga`) && fs.mkdirSync(`./manga`);
		!fs.existsSync(`./manga/${DOWNLOAD_DIR}/`) && fs.mkdirSync(`./manga/${DOWNLOAD_DIR}`);
		await writeFileAsync(filename, res.body, 'binary').catch((err) => console.log('Write error'));
		downloaded += 1;

		return process.stdout.write(', ' + img.id);
	} else {
		return console.log('err');
	}
}

async function crawlManga(url, min, max) {
	const links = await getChapters(url, min, max, true);
	let totalChapter = `${links[0].chapter} - ${links[links.length - 1].chapter} | ${links.length} chapter(s)`;
	console.log('Downloading chapter ' + totalChapter + '. ');

	for (const link of links) {
		let imgLinks = await getImages(link.url, link.chapter).catch((err) => console.log(err));
		printProcess(link.chapter, imgLinks.length);
		let tempArr = [];
		for (let i = 0; i < imgLinks.length; i++) {
			if (!tempArr.includes(i)) {
				if (i + 2 < imgLinks.length) {
					await Promise.allSettled([
						download(imgLinks[i]),
						download(imgLinks[i + 1]),
						download(imgLinks[i + 2])
					]);
					tempArr.push(i + 1);
					tempArr.push(i + 2);
				} else if (i + 1 < imgLinks.length) {
					await Promise.allSettled([ download(imgLinks[i]), download(imgLinks[i + 1]) ]);
					tempArr.push(i + 1);
				} else {
					download(imgLinks[i]);
					tempArr.push(i);
				}
				printProcess(link.chapter, imgLinks.length);
			}
		}
		printProcess(link.chapter, imgLinks.length, true);

		downloaded = 0;
	}
	// console.log(links);
}

function printProcess(chapter, imgLen, complete = false) {
	process.stdout.write('\033c');
	if (complete) {
		process.stdout.write('Downloaded chapter ' + chapter + '.');
	} else {
		process.stdout.write(`Downloading Chapter ${chapter}: ${imgLen} || Downloaded: ${downloaded}`);
	}
}

if (argv[2] === 'manga') {
	getManga(argv[3], argv[4], argv[5]);
} else if (argv[2] === 'chapter') {
	getChapters(argv[3], argv[4], argv[5]);
} else if (argv[2] === 'crawl') {
	crawlManga(argv[3], argv[4], argv[5]);
}
