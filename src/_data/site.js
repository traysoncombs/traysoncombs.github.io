module.exports = function () {
	return {
		"title": "Trayson's Website",
		"description": "This is just a little personal website that I vibecoded to showcase some of my projects as well my astroimages that I've taken.",
		"url": "https://traysoncombs.com",
		"author": "Trayson Combs",
		"meta_data": {
			"Instagram": "@trayson_combs",
		},
		"env": process.env.ELEVENTY_ENV === 'production'
	};
};

