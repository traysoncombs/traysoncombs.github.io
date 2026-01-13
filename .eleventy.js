const {DateTime} = require("luxon");
const isProduction = process.env.ELEVENTY_ENV === "production";
const htmlnano = require("htmlnano");
const htmlSave = require("htmlnano").presets.safe;
const markdownIt = require("markdown-it");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

module.exports = function (eleventyConfig) {
	// Folders to copy to build dir
	eleventyConfig.addPassthroughCopy("src/static");
	eleventyConfig.addPassthroughCopy({"src/_assets/js": "js"});

	// Filter to parse dates
	eleventyConfig.addFilter("htmlDateString", function (dateObj) {
		return DateTime.fromJSDate(dateObj, {
			zone: "utc",
		}).toFormat("yyyy-LL-dd");
	});

	// Compress/Minify HTML output on production builds
	eleventyConfig.addTransform("compressHTMLOutput", (content, outputPath) => {
		const options = {
			removeEmptyAttributes: false, // Disable the module "removeEmptyAttributes"
			collapseWhitespace: "conservative", // Pass options to the module "collapseWhitespace"
		};
		// posthtml, posthtml-render, and posthtml-parse options
		const postHtmlOptions = {
			lowerCaseTags: true, // https://github.com/posthtml/posthtml-parser#options
			quoteAllAttributes: false, // https://github.com/posthtml/posthtml-render#options
		};

		if (outputPath.endsWith(".html") && isProduction) {
			return htmlnano
				.process(content, options, htmlSave, postHtmlOptions)
				.then(function (result) {
					return result.html;
				})
				.catch(function (err) {
					console.error(err);
				});
		}

		return content;
	});

	// This allows Eleventy to watch for file changes during local development.
	eleventyConfig.setUseGitIgnore(false);

	eleventyConfig.setLibrary("md", markdownIt(
		{
			html: true,
			breaks: true,
			linkify: true,
		})
	);

	eleventyConfig.addPlugin(syntaxHighlight);

	return {
		dir: {
			input: "src",
			output: "dist",
			includes: "_includes",
			layouts: "_layouts",
			data: "_data",
		},
		host: "0.0.0.0",
		templateFormats: ["html", "md", "njk"],
		htmlTemplateEngine: "njk",
		markdownTemplateEngine: 'njk',
		passthroughFileCopy: true,
		plugins: [
			require('@tailwindcss/typography'),
		],
	};
};
