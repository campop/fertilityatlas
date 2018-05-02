// Online atlas application code

/*jslint browser: true, white: true, single: true, for: true */
/*global alert, console, window, Cookies, $, jQuery, L, autocomplete, vex */

var onlineatlas = (function ($) {
	
	'use strict';
	
	// Internal class properties
	var _baseUrl;
	var _mapUis = {};
	var _secondMapLoaded = false;
	
	// Settings
	var _settings = {
		
		// Default map view
		defaultLocation: {
			latitude: 53.035,
			longitude: -1.082,
			zoom: 7
		},
		
		// Max/min zoom
		maxZoom: 13,	// Zoomed in
		minZoom: 6,		// Zoomed out
		
		// Max bounds
		maxBounds: [[47, -14], [60, 7]],	// South, West ; East, North
		
		// Tileservers; historical map sources are listed at: http://wiki.openstreetmap.org/wiki/National_Library_of_Scotland
		defaultTileLayer: 'bartholomew',
		tileUrls: {
			'bartholomew': [
				'https://geo.nls.uk/mapdata2/bartholomew/great_britain/{z}/{x}/{y}.png',	// E.g. http://geo.nls.uk/mapdata2/bartholomew/great_britain/12/2046/2745.png
				{maxZoom: 15, attribution: '&copy; <a href="http://maps.nls.uk/copyright.html">National Library of Scotland</a>', 'backgroundColour': '#a2c3ba'},
				'NLS - Bartholomew Half Inch, 1897-1907'
			],
			'os1inch': [
				'https://geo.nls.uk/maps/os/1inch_2nd_ed/{z}/{x}/{y}.png',	// E.g. https://geo.nls.uk/maps/os/1inch_2nd_ed/15/16395/10793.png
				{maxZoom: 15, attribution: '&copy; <a href="https://maps.nls.uk/copyright.html">National Library of Scotland</a>', backgroundColour: '#f0f1e4', key: '/images/mapkeys/os1inch.jpg'},
				'NLS - OS One Inch, 1885-1900'
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
		
		// Dataset years
		datasets: [],	// Will be supplied
		
		// Fields and their labels
		fields: {},		// Will be supplied
		defaultField: '',		// Will be supplied
		
		// Map geometry colours; colour scales can be created at http://www.colorbrewer.org/
		colourStops: [],		// Will be supplied
		colourUnknown: false,	// Will be supplied
		valueUnknownString: false,	// Will be supplied
		intervalsMode: false,
		
		// Null data values
		nullDataMessage: '[Data not available]',
		
		// Zoomed out mode
		zoomedOut: false,
		
		// Close zoom mode
		closeZoom: false,
		closeField: false,
		farField: false,
		
		// Export mode enabled
		export: true,
		
		// Welcome message
		firstRunMessageHtml: ''
	};
	
	
	
	// Functions
	return {
		
		// Entry point
		initialise: function (config, baseUrl)
		{
			// Obtain the configuration and add to settings
			$.each (config, function (key, value) {
				_settings[key] = value;
			});
			
			// Parse out the intervals in each field into an array, for use as colour stops
			$.each (_settings.fields, function (field, value) {
				if (typeof value.intervals == 'string') {
					_settings.fields[field].intervals = value.intervals.split(', ');
				}
			});
			
			// Obtain the base URL
			_baseUrl = baseUrl;
			
			// Create the map panel and associated controls
			_mapUis[0] = onlineatlas.createMapUi (0);
			
			// Add support for side-by-side comparison
			onlineatlas.sideBySide ();
		},
		
		
		// Function to add support for side-by-side comparison
		sideBySide: function ()
		{
			// Add checkbox controls to enable and syncronise side-by-side maps
			var checkboxesHtml = '<p id="comparebox">';
			checkboxesHtml += '<span id="syncronisebutton"><label for="syncronise"><img src="/images/icons/arrow_refresh.png" alt="" class="icon" /> Keep map positions in sync &nbsp;</label><input id="syncronise" name="syncronise" type="checkbox" checked="checked"></span> ';
			checkboxesHtml += '<span id="comparebutton"><label for="compare"><img src="/images/icons/application_tile_horizontal.png" alt="" class="icon" /> Compare side-by-side &nbsp;</label><input id="compare" name="compare" type="checkbox"></span>';
			checkboxesHtml += '</p>';
			$('#mapcontainers').prepend (checkboxesHtml);
			
			// Handle toggle
			$('#compare').on('click', function() {
				
				// Obtain the year index
				var yearIndex = $('#' + _mapUis[0].yearDivId).val();
				
				// Side-by-side mode
				if ( $(this).is(':checked') ) {
					$('#mapcontainers').addClass('sidebyside');
					
					// Load the second map UI if not already loaded
					if (!_secondMapLoaded) {
						_mapUis[1] = onlineatlas.createMapUi (1);
						_secondMapLoaded = true;
						
						// Clone the current radiobutton value to be the new select value
						var fieldValue = _mapUis[0].field;
						$('#' + _mapUis[0].navDivId + ' form select').val(fieldValue);
						
						// Clone the current year and field values to be the defaults for the new map
						$('#' + _mapUis[1].yearDivId).val(yearIndex);
						$('#' + _mapUis[1].navDivId + ' form select').val(fieldValue);
						
						// Register handlers to keep the select and radiobuttons in sync, for each map
						var value;
						var fieldname;
						$.each (_mapUis, function (index, mapUi) {
							$('#' + mapUi.navDivId + ' form input[type="radio"]').on('change', function() {
								value = $(this).val();
								$('#' + mapUi.navDivId + ' form select').val( value );
							});
							$('#' + mapUi.navDivId + ' form select').on('change', function() {
								value = $(this).val();
								fieldname = 'field' + index + '_' + onlineatlas.htmlspecialchars (value);
								$('#' + fieldname).prop('checked', true);
							});
						});
						
						// Register a handler to dim out options which are not available for the selected year
						onlineatlas.dimUnavailableHandlerWrapper (_mapUis[1]);
					}
					
					// Show the second map
					$('#mapcontainer1').show ();
					
					// Redraw the year control in the first form, to reset the layout sizing
					var yearRangeControl = onlineatlas.yearRangeControl (_mapUis[0].navDivId, _mapUis[0].yearDivId, yearIndex);
					$('#' + _mapUis[0].navDivId + ' form .yearrangecontrol').html (yearRangeControl);
					$('#' + _mapUis[0].navDivId + ' form .yearrangecontrol').on('change', function() {	// Re-register to refresh data on any form field change
						onlineatlas.getData (_mapUis[0]);
					});
					
					// Register a handler to dim out options which are not available for the selected year
					onlineatlas.dimUnavailableHandlerWrapper (_mapUis[0]);
					
					// Re-centre the first map
					//setTimeout (function() {_mapUis[0].map.invalidateSize ()}, 400 );
					
					// Show the syncronisation button
					$('#syncronisebutton').show ();
					
					// Prevent far-out zoom, as a workaround for side-by-side interacting with maxBounds, which causes looping in Chrome and memory issues in Firefox
					var sideBySideAcceptableZoom = 7;
					_mapUis[0].map.options.minZoom = sideBySideAcceptableZoom;
					
					// By default, syncronise the map positions
					_mapUis[0].map.sync (_mapUis[1].map);
					_mapUis[1].map.sync (_mapUis[0].map);
					$('#syncronise').on('click', function() {
						if ( $(this).is(':checked') ) {
							_mapUis[0].map.sync (_mapUis[1].map);
							_mapUis[1].map.sync (_mapUis[0].map);
						} else {
							_mapUis[0].map.unsync (_mapUis[1].map);
							_mapUis[1].map.unsync (_mapUis[0].map);
						}
					});
					
				// Normal, single map mode
				} else {
					$('#mapcontainers').removeClass('sidebyside');
					
					// Hide the second map
					$('#mapcontainer1').hide ();
					
					// Redraw the year control, to reset the layout sizing
					var yearRangeControl = onlineatlas.yearRangeControl (_mapUis[0].navDivId, _mapUis[0].yearDivId, yearIndex);
					$('#' + _mapUis[0].navDivId + ' form .yearrangecontrol').html (yearRangeControl);
					
					// Register a handler to dim out options which are not available for the selected year
					onlineatlas.dimUnavailableHandlerWrapper (_mapUis[0]);
					
					// Re-centre the first map
					//setTimeout (function() {_mapUis[0].map.invalidateSize ()}, 400 );
					
					// Hide the syncronisation button
					$('#syncronisebutton').hide ();
					
					// Reset the min zoom level
					_mapUis[0].map.options.minZoom = _settings.minZoom;
					
					// Unsyncronise the map positions
					_mapUis[0].map.unsync (_mapUis[1].map);
					_mapUis[1].map.unsync (_mapUis[0].map);
				}
			});
		},
		
		
		// Main function to create a map panel
		createMapUi: function (mapUiIndex)
		{
			// Create a map UI collection object
			var mapUi = {};
			
			// Create a div for this map UI within the mapcontainers section div
			mapUi.index = mapUiIndex;
			mapUi.containerDivId = 'mapcontainer' + mapUi.index;
			$('#mapcontainers').append ('<div id="' + mapUi.containerDivId + '" class="mapcontainer"></div>');
			
			// Create the map
			mapUi.mapDivId = 'map' + mapUi.index;
			onlineatlas.createMap (mapUi);
			
			// Create the nav panel
			onlineatlas.createNav (mapUi);
			
			// Create the location overlay pane
			onlineatlas.createLocationsOverlayPane (mapUi.map);
			
			// Show first-run welcome message if the user is new to the site
			onlineatlas.welcomeFirstRun ();
			
			// Determine the active field, and create a handler for changes
			mapUi.field = _settings.defaultField;	// E.g. TMFR, TFR, etc.
			$('#' + mapUi.navDivId + ' form input[type="radio"], #' + mapUi.navDivId + ' form select').on('change', function() {
				mapUi.field = onlineatlas.getField (mapUi.navDivId);
			});
			
			// Create the legend for the current field, and update on changes
			onlineatlas.createLegend (mapUi);
			$('#' + mapUi.navDivId + ' form input[type="radio"], #' + mapUi.navDivId + ' form select').on('change', function() {
				onlineatlas.setLegend (mapUi);
			});
			
			// Register a summary box control
			onlineatlas.summaryControl (mapUi);
			$('#' + mapUi.navDivId + ' form input[type="radio"], #' + mapUi.navDivId + ' form select').on('change', function() {
				mapUi.summary.update (mapUi.field, null, mapUi.currentZoom);
			});
			
			// Add the data via AJAX requests
			onlineatlas.getData (mapUi);
			
			// Register to refresh data on map move
			mapUi.map.on ('moveend', function (e) {
				onlineatlas.getData (mapUi);
			});
			
			// Register to refresh data on any form field change
			$('#' + mapUi.navDivId + ' form :input').on('change', function() {
				onlineatlas.getData (mapUi);
			});
			
			// Add tooltips to the forms
			onlineatlas.tooltips ();
			
			// Register a dialog dialog box handler, giving a link to more information
			onlineatlas.moreDetails ();
			
			// Return the mapUi handle
			return mapUi;
		},
		
		
		// Function to determine the field from the form value
		getField: function (navDivId)
		{
			// Switch between radiobuttons (full mode) and select (side-by-side mode)
			if ( $('#' + navDivId + ' select').is(':visible') ) {
				return $('#' + navDivId + ' form select').val();
			} else {
				return $('#' + navDivId + ' form input[type="radio"]:checked').val();
			}
		},
		
		
		// Function to create the map and attach this to the mapUi
		createMap: function (mapUi)
		{
			// Create a div for this map within the map UI container
			$('#' + mapUi.containerDivId).append ('<div id="' + mapUi.mapDivId + '" class="map"></div>');
			
			// Add the tile layers
			var tileLayers = [];		// Background tile layers
			var baseLayers = {};		// Labels, by name
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
			
			// Parse any hash in the URL to obtain any default position
			var urlParameters = onlineatlas.getUrlParameters ();
			var defaultLocation = (urlParameters.defaultLocation || _settings.defaultLocation);
			var defaultTileLayer = (urlParameters.defaultTileLayer || _settings.defaultTileLayer);
			
			// Create the map
			var map = L.map (mapUi.mapDivId, {
				center: [defaultLocation.latitude, defaultLocation.longitude],
				zoom: defaultLocation.zoom,
				layers: baseLayersById[defaultTileLayer],	// Documentation suggests tileLayers is all that is needed, but that shows all together
				maxZoom: _settings.maxZoom,
				minZoom: _settings.minZoom,
				maxBounds: _settings.maxBounds
			}).setActiveArea('activearea');
			
			// Set a class corresponding to the map tile layer, so that the background can be styled with CSS
			onlineatlas.setMapBackgroundColour (tileLayers[0].options);
			map.on('baselayerchange', function(e) {
				onlineatlas.setMapBackgroundColour (baseLayers[e.name].options);
			});
			
			// Set the zoom and determine whether the map is zoomed out too far, and set the mouse cursor
			mapUi.currentZoom = map.getZoom();
			mapUi.zoomedOut = (_settings.zoomedOut ? (_settings.defaultZoom <= _settings.zoomedOut) : false);
			map.on('zoomend', function() {
				mapUi.currentZoom = map.getZoom();
				mapUi.zoomedOut = (_settings.zoomedOut ? (mapUi.currentZoom <= _settings.zoomedOut) : false);
			});
			
			// Set mouse cursor based on zoom status
			$('#map').css('cursor', (mapUi.zoomedOut ? 'zoom-in' : 'auto'));
			
			// Zoom in on single click if zoomed out, if enabled
			if (_settings.zoomedOut) {
				map.on ('click', function (e) {
					if (mapUi.zoomedOut) {
						map.setZoomAround (e.latlng, (_settings.zoomedOut + 1));
					}
				});
			}
			
			// Add the base (background) layer switcher
			L.control.layers(baseLayers, null, {position: 'bottomright'}).addTo(map);
			
			// Add geocoder control
			onlineatlas.createGeocoder (mapUi);
			
			// Add hash support
			if (mapUi.index == 0) {		// If more than one map on the page, apply only to the first one
				new L.Hash (map, baseLayersById);
			}
			
			// Add full screen control
			map.addControl(new L.Control.Fullscreen({pseudoFullscreen: true}));
			
			// Add geolocation control
			L.control.locate({
				icon: 'fa fa-location-arrow',
				locateOptions: {maxZoom: 12}
			}).addTo(map);
			
			// Attach the map to the mapUi
			mapUi.map = map;
		},
		
		
		// Function to parse the URL parameters
		getUrlParameters: function ()
		{
			// Start a list of parameters
			var urlParameters = {};
			
			// Get the location from the URL
			urlParameters.defaultLocation = null;
			urlParameters.defaultTileLayer = null;
			if (window.location.hash) {
				var hashParts = window.location.hash.match (/^#([0-9]{1,2})\/([\-.0-9]+)\/([\-.0-9]+)\/([a-z0-9]+)$/);	// E.g. #17/51.51137/-0.10498/bartholomew
				if (hashParts) {
					urlParameters.defaultLocation = {
						latitude: hashParts[2],
						longitude: hashParts[3],
						zoom: hashParts[1]
					};
					urlParameters.defaultTileLayer = hashParts[4];
				}
			}
			
			// Return the parameters
			return urlParameters;
		},
		
		
		// Function to set the map background colour for a layer
		setMapBackgroundColour: function (tileLayerOptions)
		{
			// Set, using jQuery, if specified, or clear
			var backgroundColour = (tileLayerOptions.backgroundColour ? tileLayerOptions.backgroundColour : '');
			$('.leaflet-container').css ('background-color', backgroundColour);
		},
		
		
		// Wrapper function to add a geocoder control
		createGeocoder: function (mapUi)
		{
			// Create a div for the geocoder within the map container
			var geocoderDivId = 'geocoder' + mapUi.index;
			$('#' + mapUi.containerDivId).prepend ('<div id="' + geocoderDivId + '" class="geocoder"></div>');
			
			// Create the input form within the geocoder container
			$('#' + geocoderDivId).append ('<input type="text" name="location" autocomplete="off" placeholder="Search locations and move map" tabindex="1" />');
			
			// Attach the autocomplete library behaviour to the location control
			autocomplete.addTo ('#' + geocoderDivId + ' input', {
				sourceUrl: _settings.geocoderApiBaseUrl + '?key=' + _settings.geocoderApiKey + '&bounded=1&bbox=' + _settings.autocompleteBbox,
				select: function (event, ui) {
					var bbox = ui.item.feature.properties.bbox.split(',');
					mapUi.map.fitBounds([ [bbox[1], bbox[0]], [bbox[3], bbox[2]] ]);
					event.preventDefault();
				}
			});
		},
		
		
		// Function to create the navigation panel
		createNav: function (mapUi)
		{
			// Remove any current content, e.g. due to redrawing
			mapUi.navDivId = 'nav' + mapUi.index;
			$('#' + mapUi.navDivId).remove();
			
			// Create a div for the nav within the map container
			$('#' + mapUi.containerDivId).prepend ('<nav id="' + mapUi.navDivId + '"></nav>');
			
			// Create a form within the nav
			$('#' + mapUi.navDivId).append ('<form></form>');
			
			// Create an export link
			if (_settings.export) {
				var exportDivId = 'export' + mapUi.index;
				$('#' + mapUi.navDivId + ' form').prepend ('<p id="' + exportDivId + '" class="export"><a href="#" title="Export the current view (as shown on the map) as raw data"><img src="/images/icons/page_excel.png" alt="" /> Export</a></p>');
			}
			
			// Create the year range control
			mapUi.yearDivId = 'year' + mapUi.index;
			var yearRangeControl = onlineatlas.yearRangeControl (mapUi.navDivId, mapUi.yearDivId, 1);
			
			// Add the year control to the form
			$('#' + mapUi.navDivId + ' form').append ('<h3>Year:</h3>');
			$('#' + mapUi.navDivId + ' form').append ('<div class="yearrangecontrol"></div>');
			$('#' + mapUi.navDivId + ' form .yearrangecontrol').append (yearRangeControl);
			
			// Group the fields
			var fieldGroups = onlineatlas.groupFields (_settings.fields);
			
			// Build radiobutton and select list options; both are created up-front, and the relevant one hidden according when changing to/from side-by-side mode
			var radiobuttonsHtml = '';
			var selectHtml = '';
			var fieldId;
			var heading;
			var field;
			var hasGroups = false;
			$.each (fieldGroups, function (i, fieldGroup) {
				
				// Determine the heading, if any
				heading = (fieldGroup.name.match(/^_[0-9]+$/) ? false : fieldGroup.name);	// Virtual fields use _<number>, as per virtualGroupingIndex below
				
				// Add heading for this group if required
				if (heading) {
					radiobuttonsHtml += '<h4>' + onlineatlas.htmlspecialchars (heading) + ' <i class="fa fa-chevron-circle-right iconrotate"></i></h4>';
					radiobuttonsHtml += '<div class="fieldgroup">';
					selectHtml += '<optgroup label="' + onlineatlas.htmlspecialchars (heading) + ':">';
					hasGroups = true;
				}
				
				// Add each field
				$.each (fieldGroup.fields, function (j, id) {
					field = _settings.fields[id];
					
					// Skip general fields, like year
					if (field.general) {return /* i.e. continue */;}
					
					// Construct the radiobutton list (for full mode)
					fieldId = 'field' + mapUi.index + '_' + onlineatlas.htmlspecialchars (id);
					radiobuttonsHtml += '<div class="field" title="' + onlineatlas.htmlspecialchars (field.description) + '">';
					radiobuttonsHtml += '<input type="radio" name="field" value="' + onlineatlas.htmlspecialchars (id) + '" id="' + fieldId + '"' + (id == _settings.defaultField ? ' checked="checked"' : '') + ' />';
					radiobuttonsHtml += '<label for="' + fieldId + '">';
					radiobuttonsHtml += onlineatlas.htmlspecialchars (field.label);
					radiobuttonsHtml += ' <a class="moredetails" data-field="' + id + '" href="#" title="Click to read FULL DESCRIPTION for:\n' + onlineatlas.htmlspecialchars (field.description) + '">(?)</a>';
					radiobuttonsHtml += '</label>';
					radiobuttonsHtml += '</div>';
					
					// Select widget (for side-by-side mode)
					selectHtml += '<option value="' + onlineatlas.htmlspecialchars (id) + '">' + onlineatlas.htmlspecialchars (field.label) + '</option>';
				});
				
				// End heading container for this group
				if (heading) {
					radiobuttonsHtml += '</div>';	// .fieldgroup
					selectHtml += '</optgroup>';
				}
			});
			
			// Add a container for the radiobuttons
			radiobuttonsHtml = '<div class="radiobuttons">' + radiobuttonsHtml + '</div>';
			
			// Assemble the select widget
			selectHtml = '<select name="field" id="field' + mapUi.index + '">' + selectHtml + '</select>';
			
			// Create the year control within the form
			$('#' + mapUi.navDivId + ' form').append ('<h3>Show:</h3>');
			$('#' + mapUi.navDivId + ' form').append (radiobuttonsHtml);
			$('#' + mapUi.navDivId + ' form').append (selectHtml);
			
			// Register a slide menu handler, if groupings are present
			if (hasGroups) {
				$('.mapcontainer nav#' + mapUi.navDivId + ' form div.radiobuttons h4').click (function (event) {
					
					// Fold out menu
					$(this).next('div').slideToggle();
					
					// Rotate arrow
					if ($('i', this).css('transform') == 'none') {
						$('i', this).css('transform', 'rotate(90deg)');
					} else {
						$('i', this).css('transform', 'none');
					}
					
					// Firefox: Prevent closing straight after opening; not sure why this is needed
					event.preventDefault();
				});
				
				// Expand the heading for the default field if required
				if (_settings.defaultField) {
					var checkboxId = 'field' + mapUi.index + '_' + onlineatlas.htmlspecialchars (_settings.defaultField);
					$('#' + checkboxId).parent().parent().slideToggle();
				}
			}
			
			// Register a handler to dim out options which are not available for the selected year
			onlineatlas.dimUnavailableHandlerWrapper (mapUi);
		},
		
		
		// Wrapper for dimUnavailableHandler
		dimUnavailableHandlerWrapper: function (mapUi)
		{
			// Scan for year value on load and on change
			onlineatlas.dimUnavailableHandler (mapUi);
			$('#' + mapUi.navDivId + ' form input[type="range"]').on('change', function() {
				onlineatlas.dimUnavailableHandler (mapUi);
			});
		},
		
		
		// Function to provide a handler to dim out options which are not available for the selected year
		dimUnavailableHandler: function (mapUi)
		{
			// Obtain the year value
			var yearIndex = $('#' + mapUi.yearDivId).val();
			var yearValue = _settings.datasets[yearIndex];
			
			// Loop through each field, and determine the years which are unavailable
			var fieldId;
			var paths;
			$.each (_settings.fields, function (fieldKey, field) {
				if (field.unavailable) {
					fieldId = 'field' + mapUi.index + '_' + onlineatlas.htmlspecialchars (fieldKey);
					paths = 'input#' + fieldId + ', label[for="' + fieldId + '"], select[id="field' + mapUi.index + '"] option[value="' + fieldKey + '"]';
					if ($.inArray (yearValue, field.unavailable) != -1) {	// https://api.jquery.com/jQuery.inArray/
						$(paths).addClass ('unavailable');
						//$('input#' + fieldId).prop('title', '[Not available for this year]');
					} else {
						$(paths).removeClass ('unavailable');
						//$('input#' + fieldId).removeAttr('title');
					}
				}
			});
		},
		
		
		// Function to create a year range control, including labels
		yearRangeControl: function (navDivId, yearDivId, value)
		{
			// Determine the width for the labels
			var maxBoxWidth = $('#' + navDivId).width () - 30;	// Maximum size of slider
			var totalLabels = _settings.datasets.length;
			var labelWidth = Math.floor (maxBoxWidth / totalLabels);
			var sliderWidth = maxBoxWidth - labelWidth;		// Remove one, because there needs to be a half-width space at each end
			var sliderMargin = Math.floor (labelWidth / 2);		// Half-width space at each end
			var smallLabelWidthThreshold = 40;
			var rangeClass = (labelWidth < smallLabelWidthThreshold ? ' smalllabels' : '');
			if (labelWidth < smallLabelWidthThreshold) {
				labelWidth = labelWidth - 1;
			}
			
			// Construct a datalist for the year control
			var datalistHtml = '<ul class="rangelabels' + rangeClass + '">';
			$.each (_settings.datasets, function (index, year) {
				datalistHtml += '<li style="width: ' + labelWidth + 'px;">' + year + '</li>';
			});
			datalistHtml += '</ul>';
			
			// Combine the range slider and the associated datalist
			var html = ' <input type="range" id="' + yearDivId + '" min="0" max="' + (_settings.datasets.length - 1) + '" step="1" value="' + value + '" style="width: ' + sliderWidth + 'px; margin-left: ' + sliderMargin + 'px;" /> ';
			html += datalistHtml;
			
			// Return the HTML
			return html;
		},
		
		
		// Function to create ordered group clusterings
		groupFields: function (fields)
		{
			// Group fields, either by explicit grouping (which will have fold-out headings) or virtual grouping (which not have headings)
			var groupings = {};
			var grouping;
			var virtualGroupingIndex = 0;
			var orderingIndex = 0;
			$.each (fields, function (id, field) {
				if (field.grouping) {
					grouping = field.grouping;
				} else {
					grouping = '_' + virtualGroupingIndex;	// E.g. _0, _1, etc.
					virtualGroupingIndex++;
				}
				if (!groupings[grouping]) {		// Initialise container if not already present
					groupings[grouping] = {ordering: orderingIndex, fields: []};
					orderingIndex++;
				}
				groupings[grouping]['fields'].push (id);
			});
			
			// Order the groupings
			var fieldGroups = [];
			$.each (groupings, function (name, grouping) {
				fieldGroups[grouping.ordering] = {name: name, fields: grouping.fields};
			});
			
			// Return the field groups
			return fieldGroups;
		},
		
		
		// Function to create a location overlay pane; see: http://leafletjs.com/examples/map-panes/
		createLocationsOverlayPane: function (map)
		{
			// Create a pane
			map.createPane('labels');
			map.getPane('labels').style.zIndex = 650;
			map.getPane('labels').style.pointerEvents = 'none';
			
			// Create a labels layer; see: https://carto.com/location-data-services/basemaps/
			//var locationLabels = L.tileLayer('http://tiles.oobrien.com/shine_labels_cdrc/{z}/{x}/{y}.png', {
			var locationLabels = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap, &copy; CartoDB',
				pane: 'labels'
			});
			
			// Add to the map
			locationLabels.addTo(map);
		},
		
		
		// Function to show a welcome message on first run
		welcomeFirstRun: function ()
		{
			// End if no welcome message
			if (!_settings.firstRunMessageHtml) {return;}
			
			// End if cookie already set
			var name = 'welcome';
			if (Cookies.get(name)) {return;}
			
			// Set the cookie
			Cookies.set(name, '1', {expires: 14});
			
			// Define a welcome message
			var message = _settings.firstRunMessageHtml;
			
			// Show the dialog
			vex.dialog.alert ({unsafeMessage: message});
		},
		
		
		// Handler for a more details popup layer
		moreDetails: function ()
		{
			// Create popup when link clicked on
			$('.moredetails').click (function (e) {
				
				// Obtain the field
				var field = $(this).attr('data-field');
				
				// Obtain the content; see: https://stackoverflow.com/a/14744011/180733 and https://stackoverflow.com/a/25183183/180733
				var dialogBoxContentHtml = $('#aboutfields').find('h3.' + field).nextUntil('h3').addBack().map(function() {
					return this.outerHTML;
				}).get().join('');
				if (!dialogBoxContentHtml) {
					dialogBoxContentHtml = '<p><em>Sorry, no further details for this field available yet.</em></p>';
				}
				
				// Wrap in a div
				dialogBoxContentHtml = '<div id="moredetailsboxcontent">' + dialogBoxContentHtml + '</div>';
				
				// Create the dialog box
				onlineatlas.dialogBox ('#moredetails', field, dialogBoxContentHtml);
				
				// Prevent link
				e.preventDefault ();
			});
		},
		
		
		// Dialog box
		dialogBox: function (triggerElement, name, html)
		{
			html = '<div id="moredetailsbox">' + html + '</div>';
			vex.dialog.buttons.YES.text = 'Close';
			vex.dialog.alert ({unsafeMessage: html, showCloseButton: true, className: 'vex vex-theme-plain wider'});
		},
		
		
		// Function to add data to the map via an AJAX API call
		getData: function (mapUi)
		{
			// Start API data parameters
			var apiData = {};
			
			// Supply the bbox and zoom
			apiData.bbox = mapUi.map.getBounds().toBBoxString();
			apiData.zoom = mapUi.currentZoom;
			
			// Set the field, based on the radiobutton value
			apiData.field = mapUi.field;
			
			// Set the year, based on the slider value
			var yearIndex = $('#' + mapUi.yearDivId).val();
			apiData.year = _settings.datasets[yearIndex];
			
			// Update the export link with the new parameters
			if (_settings.export) {
				var requestSerialised = $.param(apiData);
				var exportUrl = _baseUrl + '/data.csv?' + requestSerialised;
				$('#' + mapUi.navDivId + ' p.export a').attr('href', exportUrl);
			}
			
			// Start spinner, initially adding it to the page
			if (!$('#' + mapUi.containerDivId + ' #loading').length) {
				$('#' + mapUi.containerDivId).append('<img id="loading" src="' + _baseUrl + '/images/spinner.svg" />');
			}
			$('#' + mapUi.containerDivId + ' #loading').show();
			
			// Fetch data
			$.ajax({
				url: _baseUrl + '/api/locations',
				dataType: (onlineatlas.browserSupportsCors () ? 'json' : 'jsonp'),		// Fall back to JSON-P for IE9
				crossDomain: true,	// Needed for IE<=9; see: https://stackoverflow.com/a/12644252/180733
				data: apiData,
				error: function (jqXHR, error, exception) {
					
					// Show error, unless deliberately aborted
					if (jqXHR.statusText != 'abort') {
						var errorData = $.parseJSON(jqXHR.responseText);
						alert ('Error: ' + errorData.error);
					}
				},
				success: function (data, textStatus, jqXHR) {
					
					// Remove spinner
					$('#' + mapUi.containerDivId + ' #loading').hide();
					
					// Show API-level error if one occured
					// #!# This is done here because the API still returns Status code 200
					if (data.error) {
						onlineatlas.removeLayer (mapUi);
						vex.dialog.alert ('Error: ' + data.error);
						return {};
					}
					
					// Show the data successfully
					onlineatlas.showCurrentData (mapUi, data);
				}
			});
		},
		
		
		// Function to show the data for a layer
		showCurrentData: function (mapUi, data)
		{
			// If this layer already exists, remove it so that it can be redrawn
			onlineatlas.removeLayer (mapUi);
			
			// Define the data layer
			mapUi.dataLayer = L.geoJson (data, {
				
				// Handle each feature (popups, highlighting, and setting summary box data)
				// NB this has to be inlined, and cannot be refactored to a 'onEachFeature' method, as the field is needed as a parameter
				onEachFeature: function (feature, layer) {
					
					// Highlight features on hover; see: http://leafletjs.com/examples/choropleth/
					layer.on({
						
						// Highlight feature
						// NB this has to be inlined, and cannot be refactored to a 'highlightFeature' method, as the field is needed as a parameter
						mouseover: function (e) {
							
							// Set the style for this feature
							var thisLayer = e.target;
							thisLayer.setStyle({
								weight: 4
							});
							if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
								thisLayer.bringToFront();
							}
							
							// Update the summary box
							mapUi.summary.update (mapUi.field, thisLayer.feature, mapUi.currentZoom);
						},
						
						// Reset highlighting
						// NB this has to be inlined, and cannot be refactored to a 'resetHighlight' method, as the field is needed as a parameter
						mouseout: function (e) {
							
							// Reset the style
							mapUi.dataLayer.resetStyle (e.target);
							
							// Update the summary box
							mapUi.summary.update (mapUi.field, null, mapUi.currentZoom);
						}
					});
					
					// Enable popups (if close enough)
					if (!mapUi.zoomedOut) {
						var popupHtml = onlineatlas.popupHtml (feature);
						layer.bindPopup(popupHtml, {autoPan: false});
					}
				},
				
				// Style: base the colour on the specified colour field
				// NB this has to be inlined, and cannot be refactored to a 'setStyle' method, as the field is needed as a parameter
				style: function (feature) {
					if (feature.properties[mapUi.field] == null) {
						return {
							color: 'black',
							dashArray: '5, 5',
							fillColor: 'white',
							weight: (mapUi.zoomedOut ? 0 : 1),
							fillOpacity: 0.25
						};
					} else {
						return {
							color: '#777',
							fillColor: onlineatlas.getColour (feature.properties[mapUi.field], mapUi.field),
							weight: (mapUi.zoomedOut ? 0 : 1),
							fillOpacity: 0.7
						};
					}
				},
						
				// Interactivity
				interactive: (!mapUi.zoomedOut)
			});
			
			// Add to the map
			mapUi.dataLayer.addTo(mapUi.map);
			
		},
		
		
		// Helper function to enable fallback to JSON-P for older browsers like IE9; see: https://stackoverflow.com/a/1641582
		browserSupportsCors: function ()
		{
			return ('withCredentials' in new XMLHttpRequest ());
		},
		
		
		// Function to remove the data layer
		removeLayer: function (mapUi)
		{
			// Remove the layer, checking first to ensure it exists
			if (mapUi.dataLayer) {
				mapUi.map.removeLayer (mapUi.dataLayer);
			}
		},
		
		
		// Assign colour from lookup table
		getColour: function (value, field)
		{
			// Create a simpler variable for the intervals field
			var intervals = _settings.fields[field].intervals;
			
			// If the intervals is an array, i.e. standard list of colour stops, loop until found
			if (intervals[0]) {		// Simple, quick check
				
				// Compare as float, except in intervals mode
				if (!_settings.intervalsMode) {
					value = parseFloat (value);
				}
				
				// Last interval
				var lastInterval = intervals.length - 1;
				
				// Loop through until found
				var interval;
				var colourStop;
				var matches;
				var i;
				for (i = 0; i < intervals.length; i++) {
					interval = intervals[i];
					colourStop = _settings.colourStops[i];
					
					// Check for the value being explicitly unknown
					if (_settings.valueUnknownString) {
						if (value == _settings.valueUnknownString) {
							return _settings.colourUnknown;
						}
					}
					
					// In intervals mode, match exact value
					if (_settings.intervalsMode) {
						if (value == interval) {
							return colourStop;
						}
					} else {
						
						// Exact value, e.g. '0'
						matches = interval.match (/^([.0-9]+)$/);
						if (matches) {
							if (value == parseFloat(matches[1])) {
								return colourStop;
							}
						}
						
						// Up-to range, e.g. '<10'
						matches = interval.match (/^<([.0-9]+)$/);
						if (matches) {
							if (value < parseFloat(matches[1])) {
								return colourStop;
							}
						}
						
						// Range, e.g. '5-10' or '5 - <10'
						matches = interval.match (/^([.0-9]+)(-| - <)([.0-9]+)$/);
						if (matches) {
							if ((value >= parseFloat(matches[1])) && (value < parseFloat(matches[3]))) {	// 10 treated as matching in 10-20, not 5-10
								return colourStop;
							}
							
							// Deal with last, where (e.g.) 90-100 is implied to include 100
							if (i == lastInterval) {
								if (value == parseFloat(matches[2])) {
									return colourStop;
								}
							}
						}
						
						// Excess value, e.g. '100+' or '≥100'
						matches = interval.match (/^([.0-9]+)\+$/);
						if (matches) {
							if (value >= parseFloat(matches[1])) {
								return colourStop;
							}
						}
						matches = interval.match (/^≥([.0-9]+)$/);
						if (matches) {
							if (value >= parseFloat(matches[1])) {
								return colourStop;
							}
						}
					}
				}
				
				// Unknown/other, if other checks have not matched
				console.log ('Unmatched value: ' + value);
				return _settings.colourUnknown;
				
			// For pure key-value pair definition objects, read the value off
			} else {
				return intervals[value];
			}
		},
		
		
		// Function to define popup content
		popupHtml: function (feature /*, dataset */)
		{
			// Determine list of areas present in the data, to be shown in the title in hierarchical order
			var availableAreaFields = ['PARISH', 'SUBDIST', 'REGDIST', 'REGCNTY'];	// More specific first, so that listing is e.g. "Kingston, Surrey, London"
			var areaHierarchy = [];
			$.each (availableAreaFields, function (index, areaField) {
				if (feature.properties[areaField]) {
					areaHierarchy.push (feature.properties[areaField]);
				}
			});
			
			// Start with the title
			var html = '<p><strong>Displayed data for ' + areaHierarchy.join (', ') + /* ' in ' + _settings.datasets[dataset].name + */ ':</strong></p>';
			
			// Add table
			html += '<table id="chart" class="lines compressed">';
			$.each (feature.properties, function (field, value) {
				if (typeof value == 'string') {
					value = onlineatlas.htmlspecialchars (value);
				} else if (value == null) {
					value = '<span class="faded">' + _settings['nullDataMessage'] + '</span>';
				}
				html += '<tr class="' + field + '"><td>' + onlineatlas.htmlspecialchars (_settings.fields[field].label) + ':</td><td><strong>' + value + '</strong></td></tr>';
			});
			html += '</table>';
			
			// Return the HTML
			return html;
		},
		
		
		// Function to make data entity-safe
		htmlspecialchars: function (string)
		{
			// #!# Sometimes get: "Uncaught TypeError: Cannot read property 'replace' of undefined"
			return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		},
		
		
		// Function to make first character upper-case; see: https://stackoverflow.com/a/1026087/180733
		ucfirst: function (string)
		{
			return string.charAt(0).toUpperCase() + string.slice(1);
		},
		
		
		// Function to define summary box content
		summaryHtml: function (field, feature, currentZoom)
		{
			// Determine the field to use, and a suffix
			var geographicField = _settings.farField;
			if (_settings.closeZoom && _settings.closeField) {
				if (currentZoom >= _settings.closeZoom) {
					geographicField = _settings.closeField;
				}
			}
			
			// Set the value, rewriting NULL to the specified message
			var value = '<strong>' + feature.properties[field] + '</strong>';
			if (feature.properties[field] == null) {
				value = _settings['nullDataMessage'];
			}
			
			// Assemble the HTML
			var html = '<p>' + onlineatlas.htmlspecialchars (feature.properties[geographicField]) + ', in ' + feature.properties.year + ': ' + value + '</p>';
			
			// Return the HTML
			return html;
		},
		
		
		// Function to create and update the legend
		createLegend: function (mapUi)
		{
			// Affix the legend
			var legend = L.control({position: 'bottomleft'});
			
			// Define its contents
			legend.onAdd = function () {
				return L.DomUtil.create ('div', 'info legend');
			};
			
			// Add to the map
			legend.addTo(mapUi.map);
			
			// Set the initial value
			onlineatlas.setLegend (mapUi);
		},
		
		
		// Function to set the legend contents
		setLegend: function (mapUi)
		{
			// If the intervals is an array, i.e. standard list of colour stops, loop until found
			var labels = [];
			var intervals = _settings.fields[mapUi.field].intervals;
			if (intervals[0]) {		// Simple, quick check
				
				// Loop through each colour until found
				$.each (intervals, function (i, label) {
					labels.push ('<i style="background-color: ' + _settings.colourStops[i] + '; border-color: ' + _settings.colourStops[i] + ';"></i> ' + onlineatlas.htmlspecialchars (label.replace('-', ' - ')));
				});
				labels.push ('<i style="background-color: ' + _settings.colourUnknown + '; border: 1px dashed gray;"></i> ' + 'Unknown');
				labels = labels.reverse();	// Legends should be shown highest first
			} else {
				$.each (intervals, function (key, colour) {
					labels.push ('<i style="background: ' + colour + '"></i> ' + onlineatlas.htmlspecialchars (onlineatlas.ucfirst (key)));
				});
			}
			
			// Compile the HTML
			var html = '<h4>' + onlineatlas.htmlspecialchars (_settings.fields[mapUi.field].label) + '</h4>';
			html += '<p>' + onlineatlas.htmlspecialchars (_settings.fields[mapUi.field].description) + '</p>';
			html += labels.join ('<br />');
			
			// Set the HTML
			$('#' + mapUi.mapDivId + ' .legend').html (html);
		},
		
		
		// Function to create a summary box
		summaryControl: function (mapUi)
		{
			// Create the control
			mapUi.summary = L.control();
			
			// Define its contents
			var map = mapUi.map;
			mapUi.summary.onAdd = function () {
			    this._div = L.DomUtil.create('div', 'info summary'); // create a div with a classes 'info' and 'summary'
			    this.update(mapUi.field, null, mapUi.currentZoom);
			    return this._div;
			};
			
			// Register a method to update the control based on feature properties passed
			mapUi.summary.update = function (field, feature, currentZoom) {
				var html = '<h4>' + onlineatlas.htmlspecialchars (_settings.fields[field].label) + '</h4>';
				html += (feature ?
					onlineatlas.summaryHtml (field, feature, currentZoom)
					: 'Hover over an area to view details.');
				this._div.innerHTML = html;
			};
			
			// Add to the map
			mapUi.summary.addTo(map);
		},
		
		
		// Function to add tooltips, using the title value
		tooltips: function ()
		{
			// Use jQuery tooltips; see: https://jqueryui.com/tooltip/
			$('form .radiobuttons, .export').tooltip ({
				track: true
			});
			$('form .radiobuttons a.moredetails').tooltip ({
				track: true,
				classes: {'ui-tooltip': 'moredetails'},
				content: function(callback) {
					callback ($(this).prop('title').replace('\n', '<br />'));
					return true;	// Avoid nested tooltips being left visible
				}
			});
		}
		
	};
	
} (jQuery));
