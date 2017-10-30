var test = require('tape');

var debug = require('debug')('test');
var _ = require('lodash');
var fs = require('fs-extra')
var pdfDicer = require('..');
var outputPath = '';

// https://github.com/substack/tape/issues/59
var before = test;

/**
 * Creates path to use in the test.
 * @param {string} directory Path to use in tests.
 */
function createTestDirectory(directory) {
	if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory);
	}
	return directory;
}

before("before all tests", function (assert) {
	outputPath = `${__dirname}/output`;
	// Clean and prepare work directory
	if (fs.existsSync(outputPath)) {
		fs.removeSync(outputPath);
	}
	createTestDirectory(outputPath);
	assert.end()
});

test('should split by wrong barcode start in a range', function(assert) {	
	outputPath = createTestDirectory(`${__dirname}/output/wrong-barcode`);
	
	var options = {
		temp: {
			prefix: 'pdfdicer-',
			dir: outputPath
		}
	};

	var dicer = new pdfDicer();
	var stages = [];
	dicer
		.areas([
			{ // Top-left quarter
				top: "0%",
				right: "50%",
				left: "0%",
				bottom: "70%",
			},
			{ // Bottom-right quarter
				top: "70%",
				right: "0%",
				left: "50%",
				bottom: "0%",
			},
		])
		.on('stage', stage => {
			debug('stage:', stage);
			stages.push(stage);
		})
		.on('rangeExtracted', (range) => {
			
			var errors = [];

			// You can use this stage to check if the document is correct
			for (var key in range) {
				if (range.hasOwnProperty(key)) {
					var element = range[key];
					if (element.barcode.start == null || element.barcode.end == null) {
						errors.push(`Error with element key ${(element.barcode.start || element.barcode.end)}. Wrong range start or end. Check the resultant pdf.`);
					}
				}
			}	

			assert.equal(errors.length, 1);

			assert.deepEqual(range, {
				101: {
					barcode: {
						id: "101-z",
						start: "101-z",
					},
					pages: 1,
					from: 1
				},
				250: {
					barcode: {
						id: "250-a",
						start: "250-a",
						end: "250-z"
					},
					pages: 4,
					from: 2
				}
			});
		})
		.on('split', (data, stream) => {
			stream.pipe(fs.createWriteStream(`${outputPath}/range-${data.barcode.start}-${data.barcode.end}.pdf`));
		})
		.on('splitted', () => {
			var fileCount = 0;
			var fileNames = [
				'range-101-z-undefined.pdf',
				'range-250-a-250-z.pdf'
			];
			fs.readdirSync(outputPath).forEach(file => {
				if (!fs.lstatSync(outputPath + '/' + file).isDirectory() && fileNames.includes(file)) {
					fileCount++;
				}
			});
			assert.equal(fileCount, 2);

		})
		.split(`${__dirname}/data/example-wrong-barcode-start.pdf`, options, function(err, output) {
			if (err) return assert.end(err);

			assert.end();
		});
});

test('should split by alternating top/bottom barcodes', function(assert) {
	outputPath = createTestDirectory(`${__dirname}/output/alternating`);
	
	var options = {
		temp: {
			prefix: 'pdfdicer-',
			dir: outputPath
		}
	};
	
	var dicer = new pdfDicer();
	var stages = [];
	var fired = {
		tempDir: 0,
		pageConverted: 0,
		pagesConverted: 0,
		pageAnalyze: 0,
		pageAnalyzed: 0,
		pagesAnalyzed: 0,
	};

	dicer
		.areas([
			{ // Top-left quarter
				top: "0%",
				right: "50%",
				left: "0%",
				bottom: "70%",
			},
			{ // Bottom-right quarter
				top: "70%",
				right: "0%",
				left: "50%",
				bottom: "0%",
			},
		])
		.on('stage', stage => {
			debug('stage:', stage);
			stages.push(stage);
		})
		.on('tempDir', path => fired.tempDir++)
		.on('pageConverted', (page, pageNumber) => fired.pageConverted++)
		.on('pagesConverted', path => fired.pagesConverted++)
		.on('pageAnalyze', ()=> fired.pageAnalyze++)
		.on('pageAnalyzed', ()=> fired.pageAnalyzed++)
		.on('pagesAnalyzed', pages => {
			fired.pagesAnalyzed++;
			assert.deepEqual(_.map(pages).map(p => p.barcode), [
				'101-a','101-z',
				'250-a',false,false,'250-z',
				'666-a',false,'666-z',
				'1234567890-a',false,false,false,'1234567890-z',
			]);
		})
		.on('rangeExtracted', (range) => {
			
			assert.deepEqual(range, {
				101: {
					barcode: {
						id: "101-a",
						start: "101-a",
						end: "101-z"
					},
					pages: 2,
					from: 1
				},
				250: {
					barcode: {
						id: "250-a",
						start: "250-a",
						end: "250-z"
					},
					pages: 4,
					from: 3
				},
				666: {
					barcode: {
						id: "666-a",
						start: "666-a",
						end: "666-z"
					},
					pages: 3,
					from: 7
				},
				1234567890: {
					barcode: {
						id: "1234567890-a",
						start: "1234567890-a",
						end: "1234567890-z"
					},
					pages: 5,
					from:10
				}
			});

		})
		.on('split', (data, stream) => {
			stream.pipe(fs.createWriteStream(`${outputPath}/range-${data.barcode.start}-${data.barcode.end}.pdf`));
		})
		.on('splitted', () => {
			var fileCount = 0;
			var fileNames = [
				'range-101-a-101-z.pdf',
				'range-250-a-250-z.pdf',
				'range-666-a-666-z.pdf',
				'range-1234567890-a-1234567890-z.pdf'
			];
			fs.readdirSync(outputPath).forEach(file => {
				if (!fs.lstatSync(outputPath + '/' + file).isDirectory() && fileNames.includes(file)) {
					fileCount++;
				}
			});
			assert.equal(fileCount, 4);
		})
		.split(`${__dirname}/data/example-alternating.pdf`, options, function(err, output) {
			if (err) return assert.end(err);

			assert.deepEqual(stages, [
				'init', 'readPDF', 'readPages', 'extracted', 'loadRange', 
				'splitPDFWithScissors', 'splitPDFWithScissors', 'splitPDFWithScissors', 'splitPDFWithScissors'
			]);

			assert.deepEqual(fired, {
				tempDir: 1,
				pageConverted: 14,
				pagesConverted: 1,
				pageAnalyze: 14,
				pageAnalyzed: 14,
				pagesAnalyzed: 1,
			});

			assert.end();
		});
});