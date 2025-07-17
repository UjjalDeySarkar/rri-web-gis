mapboxgl.accessToken = 'pk.eyJ1IjoiYm9zaXJhIiwiYSI6ImNtY3V3Y3JjZTA0Yncyd3B4cXR4YWEwamwifQ.yWciEYaITqTBPhlgAeE9Bg';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/satellite-streets-v12',
  projection: 'globe',
  center: [0, 0],
  zoom: 1
});

map.on('style.load', () => {
  map.setFog({
    color: 'white',
    'high-color': '#add8e6',
    'horizon-blend': 0.1,
    'space-color': '#000000',
    'star-intensity': 0.2
  });

  map.addSource('mapbox-dem', {
    type: 'raster-dem',
    url: 'mapbox://mapbox.terrain-rgb',
    tileSize: 512,
    maxzoom: 14
  });
  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

  const fromProj = 'EPSG:32645';
  const toProj = 'EPSG:4326';
  proj4.defs(fromProj, '+proj=utm +zone=45 +datum=WGS84 +units=m +no_defs');

  let originalCrossSectionFeatures = [];
  const visibleCrossSection = {
    type: 'FeatureCollection',
    features: []
  };

  // === Cross Section Setup (Initial: Hidden) ===
  fetch('./data/Cross_Section.geojson')
    .then(res => res.json())
    .then(utmData => {
      const reprojectedFeatures = utmData.features.map(feature => {
        const newCoords = feature.geometry.coordinates.map(line =>
          line.map(([x, y]) => proj4(fromProj, toProj, [x, y]))
        );
        return {
          ...feature,
          geometry: { ...feature.geometry, coordinates: newCoords }
        };
      });

      // console.log("Cross Section features loaded:", reprojectedFeatures);
      originalCrossSectionFeatures = reprojectedFeatures;
      const geojson = { ...utmData, crs: undefined, features: reprojectedFeatures };

      map.addSource('cross-section', { type: 'geojson', data: visibleCrossSection });

      map.addLayer({
        id: 'cross-section-layer',
        type: 'line',
        source: 'cross-section',
        paint: {
          'line-color': '#0074D9',
          'line-width': 4,
          'line-dasharray': [2, 2]
        }
      });

      // Click handler
      map.on('click', 'cross-section-layer', (e) => {
        const props = e.features[0].properties;
        const infoHtml = `
          <table class="table table-sm table-striped table-bordered">
            <tr><th>Chainage</th><td>${props.Chainage}</td></tr>
            <tr><th>Survey Date</th><td>${props.Survey_Dt}</td></tr>
          </table>
        `;
        document.getElementById('feature-data').innerHTML = infoHtml;
      });

      map.on('mouseenter', 'cross-section-layer', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'cross-section-layer', () => map.getCanvas().style.cursor = '');
    });

  // === Centre Line Animation and Reveal Cross Sections ===
  fetch('./data/Centre_Line.geojson')
    .then(res => res.json())
    .then(utmData => {
      const reprojectedFeatures = utmData.features.map(feature => {
        const newCoords = feature.geometry.coordinates.map(line =>
          line.map(([x, y]) => proj4(fromProj, toProj, [x, y]))
        );
        return {
          ...feature,
          geometry: { ...feature.geometry, coordinates: newCoords }
        };
      });

      const geojson = { ...utmData, crs: undefined, features: reprojectedFeatures };
      const allCoords = geojson.features.flatMap(f => f.geometry.coordinates.flat()).reverse(); 

      const lons = allCoords.map(c => c[0]);
      const lats = allCoords.map(c => c[1]);
      const bounds = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];

      // Hold for 2 seconds before starting animation and fitBounds
      setTimeout(() => {
        map.fitBounds(bounds, { padding: 100, duration: 6000, pitch: 45, bearing: -20 });

        const animatedLine = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [] },
            properties: geojson.features[0].properties
          }]
        };

        map.addSource('centre-line', { type: 'geojson', data: animatedLine });

        map.addLayer({
          id: 'centre-line-layer',
          type: 'line',
          source: 'centre-line',
          paint: { 'line-color': '#FF5733', 'line-width': 4 }
        });

        let index = 0;
        const bufferDistance = 0.001;

        const interval = setInterval(() => {
          if (index >= allCoords.length) {
            clearInterval(interval);
            return;
          }

          const currentCoord = allCoords[index];
          animatedLine.features[0].geometry.coordinates.push(currentCoord);
          map.getSource('centre-line').setData(animatedLine);

          // Reveal Cross Sections dynamically
          originalCrossSectionFeatures.forEach((feature) => {
            const alreadyVisible = visibleCrossSection.features.some(
              f => f.properties.Chainage === feature.properties.Chainage
            );
            if (alreadyVisible) return;

            const lineCoords = feature.geometry.coordinates[0];
            for (const [x, y] of lineCoords) {
              const dx = x - currentCoord[0];
              const dy = y - currentCoord[1];
              if (Math.sqrt(dx * dx + dy * dy) < bufferDistance) {
                visibleCrossSection.features.push(feature);
                map.getSource('cross-section').setData(visibleCrossSection);
                break;
              }
            }
          });

          index++;
        }, 30);

        // Click on Centre Line
        map.on('click', 'centre-line-layer', (e) => {
          const props = geojson.features[0].properties;
          const infoHtml = `
            <table class="table table-sm table-striped table-bordered">
              <tr><th>Name</th><td>${props.EMB_Name}</td></tr>
              <tr><th>Ownership</th><td>${props.Ownership}</td></tr>
              <tr><th>District</th><td>${props.District}</td></tr>
              <tr><th>Block</th><td>${props.Block}</td></tr>
              <tr><th>River</th><td>${props.River_Adj}</td></tr>
              <tr><th>Side of River</th><td>${props.Side_River}</td></tr>
              <tr><th>Structures</th><td>${props.Structures || 'N/A'}</td></tr>
            </table>
          `;
          document.getElementById('feature-data').innerHTML = infoHtml;
        });

        map.on('mouseenter', 'centre-line-layer', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'centre-line-layer', () => map.getCanvas().style.cursor = '');
      }, 2000); // 2 second hold
    });
});

// === Sidebar Toggle ===
const toggleBtn = document.getElementById('toggle-btn');
const container = document.getElementById('container');

toggleBtn.addEventListener('click', () => {
  container.classList.toggle('collapsed');
  toggleBtn.textContent = container.classList.contains('collapsed') ? '⇦' : '⇨';
  setTimeout(() => map.resize(), 310);
});

// === Popup on Hover ===
const popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false
});

function adjustPopupPosition(lngLat) {
  const sidebarWidth = container.classList.contains('collapsed') ? 0 : 320;
  const mapCanvas = map.getCanvas();
  const mapRect = mapCanvas.getBoundingClientRect();
  const sidebarLeft = mapRect.right - sidebarWidth;
  const pixel = map.project(lngLat);

  if (pixel.x > sidebarLeft - 50) {
    return map.unproject([sidebarLeft - 50, pixel.y]);
  }
  return lngLat;
}

map.on('mousemove', 'centre-line-layer', (e) => {
  const coordinates = adjustPopupPosition(e.lngLat);
  const { EMB_Name } = e.features[0].properties;
  popup
    .setLngLat(coordinates)
    .setHTML(`<div class="popup-centre"><div><span class="popup-icon">🏞</span><strong>EMB Name:</strong> ${EMB_Name}</div></div>`)
    .addTo(map);
});
map.on('mouseleave', 'centre-line-layer', () => popup.remove());

map.on('mousemove', 'cross-section-layer', (e) => {
  const coordinates = adjustPopupPosition(e.lngLat);
  const { Chainage } = e.features[0].properties;
  popup
    .setLngLat(coordinates)
    .setHTML(`<div class="popup-cross"><div><span class="popup-icon">📍</span><strong>Chainage:</strong> ${Chainage}</div></div>`)
    .addTo(map);
});
map.on('mouseleave', 'cross-section-layer', () => popup.remove());
