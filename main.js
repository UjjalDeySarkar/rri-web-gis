mapboxgl.accessToken = 'pk.eyJ1IjoiYm9zaXJhIiwiYSI6ImNtY3V3Y3JjZTA0Yncyd3B4cXR4YWEwamwifQ.yWciEYaITqTBPhlgAeE9Bg';


const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/satellite-streets-v12',
  projection: 'globe',
  center: [0, 0],
  zoom: 1
});

map.on('style.load', () => {
  // Globe atmosphere
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

  // Fetch and reproject Centre Line
  fetch('/data/Centre_Line.geojson')
    .then(res => res.json())
    .then(utmData => {
      const fromProj = 'EPSG:32645';
      const toProj = 'EPSG:4326';

      proj4.defs(fromProj, '+proj=utm +zone=45 +datum=WGS84 +units=m +no_defs');

      const reprojectedFeatures = utmData.features.map(feature => {
        const newCoords = feature.geometry.coordinates.map(line =>
          line.map(([x, y]) => proj4(fromProj, toProj, [x, y]))
        );
        return {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: newCoords
          }
        };
      });

      const geojson = {
        ...utmData,
        crs: undefined,
        features: reprojectedFeatures
      };

      const allCoords = geojson.features.flatMap(f => f.geometry.coordinates.flat());

      // Fit to bounds first
      const lons = allCoords.map(c => c[0]);
      const lats = allCoords.map(c => c[1]);
      const bounds = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
      map.fitBounds(bounds, {
        padding: 100,
        duration: 6000,
        pitch: 45,
        bearing: -20
      });

      // Prepare animation-ready line source
      const animatedLine = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          },
          properties: {}
        }]
      };

      map.addSource('centre-line', {
        type: 'geojson',
        data: animatedLine
      });

      map.addLayer({
        id: 'centre-line-layer',
        type: 'line',
        source: 'centre-line',
        paint: {
          'line-color': '#FF5733',
          'line-width': 4
        }
      });

      // Animate line drawing
      let index = 0;
      const interval = setInterval(() => {
        if (index >= allCoords.length) {
          clearInterval(interval);
          return;
        }
        animatedLine.features[0].geometry.coordinates.push(allCoords[index]);
        map.getSource('centre-line').setData(animatedLine);
        index++;
      }, 30); // adjust speed here (ms per point)

      // Add popup after line is complete
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

      map.on('mouseenter', 'centre-line-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'centre-line-layer', () => {
        map.getCanvas().style.cursor = '';
      });
    })
    .catch(err => {
      console.error('Error loading or rendering Centre_Line.geojson:', err);
    });
});

const toggleBtn = document.getElementById('toggle-btn');
const container = document.getElementById('container');

toggleBtn.addEventListener('click', () => {
  container.classList.toggle('collapsed');
  toggleBtn.textContent = container.classList.contains('collapsed') ? '⇦' : '⇨';

  // Resize map after transition completes
  setTimeout(() => {
    map.resize();
  }, 310); // match CSS transition duration
});
