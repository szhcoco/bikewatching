
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';



// draw circles for each station
const svg = d3.select('#map').select('svg');

mapboxgl.accessToken = 'pk.eyJ1Ijoic3poY29jbyIsImEiOiJjbWFxZmE4dnkwOTMyMmtvbnNzbjg0cDJ5In0.oWh0TZqrEbu5qpkdck2A8A';



// initialize the map
const map = new mapboxgl.Map({
  container: 'map', 
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027], 
  zoom: 12, 
  minZoom: 5, 
  maxZoom: 18, 
});

// import the data
map.on('load', async() => {

    // add layer for boston
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.4
        },
    });

    // add layer for cambridge
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });

    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.4
        },
    });

    // load the station data
    let jsonData;
    let trips;
    let timeFilter = -1;

    try {
        const jsonurl = 'assets/data/bluebikes-stations.json';

        jsonData = await d3.json(jsonurl);

        trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
              trip.started_at = new Date(trip.started_at);
              trip.ended_at = new Date(trip.ended_at);
              return trip;
            },
          );


    } catch (error) {
        console.error('Error loading JSON:', error); 
    }

    const stations = computeStationTraffic(jsonData.data.stations, trips);

    // add traffic flow
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    const circles = svg
        .selectAll('circle')
        .data(stations, (d) => d.short_name)
        .enter()
        .append('circle')
        .attr('r', 4) 
        .attr('fill', 'steelblue') 
        .attr('stroke', 'white') 
        .attr('stroke-width', 1) 
        .attr('opacity', 0.8)
        .style('--departure-ratio', (d) => stationFlow(d.departures / d.totalTraffic)); 

    // reposition the circles when the map moves/zooms
    function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx) 
            .attr('cy', (d) => getCoords(d).cy); 
    }

    updatePositions();
    map.on('move', updatePositions); 
    map.on('zoom', updatePositions); 
    map.on('resize', updatePositions); 
    map.on('moveend', updatePositions); 


    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

    // update circle radius and opacity
    circles
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill-opacity', 0.6);

    svg.selectAll('circle')
        .each(function (d) {
          d3.select(this)
            .append('title')
            .text(
              `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
            );
        });


    // display time 
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    // update time when moving the slider
    function updateTimeDisplay() {
        const timeFilter = Number(timeSlider.value); 
    
        if (timeFilter === -1) {
            selectedTime.textContent = ''; 
            anyTimeLabel.style.display = 'block'; 
        } else {
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.display = 'none'; 
        }
  
        updateScatterPlot(timeFilter);


   
    }


    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();

    function updateScatterPlot(timeFilter) {

        const filteredTrips = filterTripsbyTime(trips, timeFilter);
      
        const filteredStations = computeStationTraffic(stations, filteredTrips);

        timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

        circles
          .data(filteredStations, (d) => d.short_name)
          .join('circle') 
          .attr('r', (d) => radiusScale(d.totalTraffic))
          .style('--departure-ratio', (d) => stationFlow(d.departures / d.totalTraffic),
        );
      }


})

function computeStationTraffic(stations, trips) {
    // draw traffic at each station
    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id,
    )

    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id,
    )

    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        // TODO departures
        station.departures = departures.get(id) ?? 0;
        // TODO totalTraffic
        station.totalTraffic = station.arrivals + station.departures;

        return station;
    });
}

// format time as HH:MM AM/PM
function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' }); 
}

// returns the number of minutes since midnight
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}


// filter data to trips that started or ended within 1 hour before or after the selected time
function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1
        ? trips //
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);

            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}
  





function getCoords(station) {
    // convert lon and lat to mapbox lnglat
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);

    // project to pixel coordinates
    const { x, y } = map.project(point); 
    return { cx: x, cy: y }; 
}




