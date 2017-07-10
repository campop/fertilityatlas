// Fertility atlas application code

/*jslint browser: true, white: true, single: true, for: true */
/*global alert, console, window, $, jQuery, L, autocomplete */

var fertilityatlas = (function ($) {
	
	'use strict';
	
	// Internal class properties
	var _map = null;
	
	// Settings
	var _settings = {
		
		// Default map view
		defaultLatitude: 53,
		defaultLongitude: -2,
		defaultZoom: 7,
		
		// Tileservers; historical map sources are listed at: http://wiki.openstreetmap.org/wiki/National_Library_of_Scotland
		tileUrls: {
			'bartholomew': [
				'http://geo.nls.uk/mapdata2/bartholomew/great_britain/{z}/{x}/{-y}.png',	// E.g. http://geo.nls.uk/mapdata2/bartholomew/great_britain/12/2046/2745.png
				{maxZoom: 15, attribution: '&copy; <a href="http://maps.nls.uk/copyright.html">National Library of Scotland</a>'},
				'NLS - Bartholomew Half Inch, 1897-1907'
			],
			'os6inch': [
				'http://geo.nls.uk/maps/os/1inch_2nd_ed/{z}/{x}/{-y}.png',	// E.g. http://geo.nls.uk/maps/os/1inch_2nd_ed/12/2046/2745.png
				{maxZoom: 15, attribution: '&copy; <a href="http://maps.nls.uk/copyright.html">National Library of Scotland</a>'},
				'NLS - OS 6-inch County Series 1888-1913'
			],
			'mapnik': [
				'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',	// E.g. http://a.tile.openstreetmap.org/16/32752/21788.png
				{maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'},
				'OpenStreetMap style (modern)'
			],
			'osopendata': [
				'https://{s}.os.openstreetmap.org/sv/{z}/{x}/{y}.png',	// E.g. http://a.os.openstreetmap.org/sv/18/128676/81699.png
				{maxZoom: 19, attribution: 'Contains Ordnance Survey data &copy; Crown copyright and database right 2010'},
				'OS Open Data (modern)'
			]
		},
		
		// Geocoder
		geocoderApiBaseUrl: 'https://api.cyclestreets.net/v2/geocoder',
		geocoderApiKey: 'YOUR_API_KEY',		// Obtain at https://www.cyclestreets.net/api/apply/
		autocompleteBbox: '-6.6577,49.9370,1.7797,57.6924',
		
		// Data; created using e.g.: ogr2ogr -f GeoJSON -s_srs EPSG:3857 -t_srs EPSG:4326 ../data/1911.geojson RSD_1911_MLS.shp
		datasets: {
			year1851: {
				name: '1851',
				source: 'data/1851.geojson'
			},
			year1861: {
				name: '1861',
				source: 'data/1861.geojson'
			},
			year1881: {
				name: '1881',
				source: 'data/1881.geojson'
			},
			year1891: {
				name: '1891',
				source: 'data/1891.geojson'
			},
			year1901: {
				name: '1901',
				source: 'data/1901.geojson'
			},
			year1911: {
				name: '1911',
				source: 'data/1911.geojson'
			}
		},
		
		// Fields and their labels
		fields: {},		// Will be supplied from the database
		
		// Map geometry styling; colour scales can be created at http://www.colorbrewer.org/
		colourField: 'TFR',
		colourStops: {
			'IMR': [	// Infant mortality rate
				[9999, 'red'],
				[180, '#ed7552'],
				[160, '#ed7552'],
				[140, '#fab884'],
				[120, '#ffffbf'],
				[100, '#c0ccbe'],
				[80, '#849eb9'],
				[0, '#4575b5']
			],
			'TFR': [	// Total fertility rate
				[9999, 'red'],
				[5, '#ed7552'],
				[4.5, '#ed7552'],
				[4, '#fab884'],
				[3.5, '#ffffbf'],
				[3, '#c0ccbe'],
				[2.5, '#849eb9'],
				[0, '#4575b5']
			],
			'TMFR': [	// Total marital fertility rate
				[9999, 'red'],
				[8.5, '#ed7552'],
				[8, '#ed7552'],
				[7, '#fab884'],
				[6, '#ffffbf'],
				[5, '#c0ccbe'],
				[4.5, '#849eb9'],
				[0, '#4575b5']
			]
		}
	};
	
	
	
	// Functions
	return {
		
		// Main function
		initialise: function (config)
		{
			// Obtain the configuration and add to settings
			$.each (config, function (key, value) {
				_settings[key] = value;
			});
			
			// Create the map
			fertilityatlas.createMap ();
			
			// Add the data to the map
			//var dataset = 'year1891';
			//fertilityatlas.addData (dataset);
			
			// Add the data to the map as switchable layers
			fertilityatlas.addSwitchableLayers ();
		},
		
		
		// Function to create the map
		createMap: function ()
		{
			// Add the tile layers
			var tileLayers = [];		// Background tile layers
			var baseLayers = {};		// Labels
			var baseLayersById = {};	// Layers, by id
			var layer;
			var name;
			$.each (_settings.tileUrls, function (tileLayerId, tileLayerAttributes) {
				layer = L.tileLayer(tileLayerAttributes[0], tileLayerAttributes[1]);
				tileLayers.push (layer);
				name = tileLayerAttributes[2];
				baseLayers[name] = layer;
				baseLayersById[tileLayerId] = layer;
			});
			
			// Create the map
			_map = L.map('map', {
				center: [_settings.defaultLatitude, _settings.defaultLongitude],
				zoom: _settings.defaultZoom,
				layers: tileLayers[0]	// Documentation suggests tileLayers is all that is needed, but that shows all together
			});
			
			// Add the base (background) layer switcher
			L.control.layers(baseLayers, null).addTo(_map);
			
			// Add geocoder control
			fertilityatlas.geocoder ();
			
			// Add hash support
			new L.Hash (_map, baseLayersById);
			
			// Add full screen control
			_map.addControl(new L.Control.Fullscreen({pseudoFullscreen: true}));
			
			// Add geolocation control
			L.control.locate().addTo(_map);
		},
		
		
		// Wrapper function to add a geocoder control
		geocoder: function ()
		{
			// Attach the autocomplete library behaviour to the location control
			autocomplete.addTo ('#geocoder input', {
				sourceUrl: _settings.geocoderApiBaseUrl + '?key=' + _settings.geocoderApiKey + '&bounded=1&bbox=' + _settings.autocompleteBbox,
				select: function (event, ui) {
					var bbox = ui.item.feature.properties.bbox.split(',');
					_map.fitBounds([ [bbox[1], bbox[0]], [bbox[3], bbox[2]] ]);
					event.preventDefault();
				}
			});
		},
		
		
		// Function to load the data to the map
		addData: function (dataset)
		{
			// Define the URL
			var url = _settings.datasets[dataset].source;
			
			// Load GeoJSON and add to the map
			$.getJSON(url, function(data) {
				var popupHtml;
				var geojsonLayer = L.geoJson(data, {
					onEachFeature: fertilityatlas.popup
				}).addTo(_map);
			});
		},
		
		
		// Function to add the data to the map as switchable layers; see: https://github.com/dwilhelm89/LeafletSlider
		addSwitchableLayers: function ()
		{
			// Create each layer
			var layers = [];
			$.each (_settings.datasets, function (key, dataset) {
				layers.push (new L.GeoJSON.AJAX (dataset.source, {
					onEachFeature: fertilityatlas.popup,
					style: fertilityatlas.setStyle,
					time: dataset.name	// The time property specified here is used to label the slider
				}));
			});
			
			// Assemble and add the layers as a slider control; see example at: http://fiddle.jshell.net/nathansnider/260hffor/
			var layerGroup = L.layerGroup(layers);
			var sliderControl = L.control.sliderControl({
				layer: layerGroup,
				follow: true
			});
			_map.addControl(sliderControl);
			sliderControl.startSlider();
		},
		
		
		// Function to set the feature style
		setStyle: function (feature)
		{
			// Base the colour on the specified colour field
			return {
				fillColor: fertilityatlas.getColour (feature.properties[_settings.colourField]),
				weight: 1,
				fillOpacity: 0.7
			};
		},
		
		
		// Assign colour from lookup table
		getColour: function (value)
		{
			// Loop through each colour until found
			var colourStop;
			for (var i = 0; i < _settings.colourStops['TFR'].length; i++) {	// NB $.each doesn't seem to work - it doesn't seem to reset the array pointer for each iteration
				colourStop = _settings.colourStops['TFR'][i];
				if (value >= colourStop[0]) {
					return colourStop[1];
				}
			}
			
			// Fallback to final colour in the list
			return colourStop[1];
		},
		
		
		// Popup wrapper
		popup: function (feature, layer)
		{
			var popupHtml = fertilityatlas.popupHtml (feature /*, dataset */);
			layer.bindPopup(popupHtml, {autoPan: false});
		},
		
		
		// Function to define popup content
		popupHtml: function (feature /*, dataset */)
		{
			// Start with the title
			var html = '<p><strong>Fertility rates for ' + feature.properties['SUBDIST'] + ', ' + feature.properties['REGDIST'] + /* ' in ' + _settings.datasets[dataset].name + */ ':</strong></p>';
			
			// Add table
			html += '<table id="chart" class="lines compressed">';
			$.each (feature.properties, function (key, value) {
				if (typeof value == 'string') {
					value = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				}
				html += '<tr class="' + key + '"><td>' + _settings.fields[key] + ':</td><td><strong>' + value + '</strong></td></tr>';
			});
			html += '</table>';
			
			// Return the HTML
			return html;
		}
		
	}
	
} (jQuery));