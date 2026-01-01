const { DateTime } = require("luxon");
const isProduction = process.env.ELEVENTY_ENV === "production";
const htmlnano = require("htmlnano");
const htmlSave = require("htmlnano").presets.safe;
const EleventyFetch = require("@11ty/eleventy-fetch");


// Fetch GitHub repository information
async function fetchGitHubRepo(url) {
	try {
		// Extract owner and repo from GitHub URL
		const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
		if (!match) {
			console.warn(`Invalid GitHub URL: ${url}`);
			return null;
		}

		const [, owner, repo] = match;
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

		const data = await EleventyFetch(apiUrl, {
			duration: "1d", // Cache for 1 day
			type: "json",
			fetchOptions: {
				headers: {
					'Accept': 'application/vnd.github.v3+json',
					// Add GitHub token if available for higher rate limits
					...(process.env.GITHUB_TOKEN && {
						'Authorization': `token ${process.env.GITHUB_TOKEN}`
					})
				}
			}
		});

		// Extract relevant information
		return {
			name: data.name,
			fullName: data.full_name,
			description: data.description,
			topics: data.topics || [],
			language: data.language,
			languages: null, // Will be populated separately if needed
			stars: data.stargazers_count,
			forks: data.forks_count,
			createdAt: data.created_at,
			updatedAt: data.updated_at,
			pushedAt: data.pushed_at,
			homepage: data.homepage,
			htmlUrl: data.html_url,
			license: data.license?.name
		};
	} catch (error) {
		console.error(`Error fetching GitHub repo ${url}:`, error.message);
		return null;
	}
}

// Fetch languages for a GitHub repository
async function fetchGitHubLanguages(url) {
	try {
		const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
		if (!match) return [];

		const [, owner, repo] = match;
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/languages`;

		const data = await EleventyFetch(apiUrl, {
			duration: "1d", // Cache for 1 day
			type: "json",
			fetchOptions: {
				headers: {
					'Accept': 'application/vnd.github.v3+json',
					...(process.env.GITHUB_TOKEN && {
						'Authorization': `token ${process.env.GITHUB_TOKEN}`
					})
				}
			}
		});

		// Return languages sorted by usage
		return Object.keys(data).sort((a, b) => data[b] - data[a]);
	} catch (error) {
		console.error(`Error fetching languages for ${url}:`, error.message);
		return [];
	}
}

// Convert GitHub data to project format
async function githubToProject(githubUrl, customData = {}) {
	const repoData = await fetchGitHubRepo(githubUrl);
	if (!repoData) return null;

	const languages = await fetchGitHubLanguages(githubUrl);

	return {
		id: customData.id || repoData.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
		title: customData.title || repoData.name,
		description: customData.description || repoData.description || "No description available",
		date: customData.date || DateTime.fromISO(repoData.createdAt).toFormat('yyyy-LL-dd'),
		detailedDescription: customData.detailedDescription || repoData.description,
		technologies: customData.technologies || languages.slice(0, 5), // Top 5 languages
		link: repoData.htmlUrl,
		stars: repoData.stars,
		topics: repoData.topics
	};
}

module.exports = function (eleventyConfig) {
	const GITHUB_BASE_URL = "https://github.com/traysoncombs";
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

	// Add projects data - you can configure this list
	eleventyConfig.addGlobalData("projects", async () => {
		const projectConfigs = [
			{
				url: `${GITHUB_BASE_URL}/nfl-pickems`,
				// Optional: override any fetched data
				title: "NFL Pick'ems Website",
				detailedDescription: "Custom detailed description"
			},
			{
				url: `${GITHUB_BASE_URL}/blockcoin`,
			},
			{
				url: `${GITHUB_BASE_URL}/ML-KEM`,
			},
			{
				url: `${GITHUB_BASE_URL}/AstroImageCompressor`,
			},
			{
				url: `${GITHUB_BASE_URL}/SLH_DSA`,
			},
			{
				url: `${GITHUB_BASE_URL}/ML-DSA`,
			},
		];

		const projects = await Promise.all(
			projectConfigs.map(config => githubToProject(config.url, config))
		);

		// Filter out any failed fetches
		return projects.filter(p => p !== null);
	});

	return {
		dir: {
			input: "src/",
			output: "dist",
			includes: "_includes",
			layouts: "_layouts",
		},
		host: "0.0.0.0",
		templateFormats: ["html", "md", "njk"],
		htmlTemplateEngine: "njk",
		passthroughFileCopy: true,
	};
};
