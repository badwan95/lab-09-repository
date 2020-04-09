'use strict';
// Load Environment Variables from the .env file
require('dotenv').config();

// Application Dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');
// Application Setup
const PORT = process.env.PORT || 4000;
const app = express();
app.use(cors());

// make a connection to the psql using the provided link
const client = new pg.Client(process.env.DATABASE_URL);
client.on('error', (err) => {
  throw new Error(err);
});

//Routes
app.get('/location',locationHandler);
app.get('/weather',weatherHandler);
app.get('/trails',trailsHandler);
app.get('/movies',moviesHandler);
app.get('/yelp',yelpHandler);
app.get('*', notFoundHandler);
app.use(errorHandler);


//Handlers
let latitude;
let longitude;
let coordArray=[];

function locationHandler(request,response){
  let city = request.query.city;
  let SQL ='SELECT * FROM locations WHERE search_query = $1';
  const values = [city];
  client
  .query(SQL,values)
  .then(result=>{
    if (result.rows.length > 0){
      let theResult = result.rows[0];
      console.log('latitde is: ',theResult.latitude)
      let lat=theResult.latitude;
      let lon=theResult.longitude;
      coordArray.push(lat,lon);
      response.status(200).json(theResult);
    }else{
      superagent(`https://eu1.locationiq.com/v1/search.php?key=${process.env.GEOCODE_API_KEY}&q=${city}&format=json`).then((resp)=>{
        const geoData = resp.body;
        const locationData = new Location(city,geoData);
        latitude = locationData.latitude;
        longitude = locationData.longitude;
        const SQL = 'INSERT INTO locations(search_query,formatted_query,latitude,longitude) VALUES ($1,$2,$3,$4)';
        const safeValues = [locationData.search_query, locationData.formatted_query,parseFloat(locationData.latitude),parseFloat(locationData.longitude)];
        client.query(SQL,safeValues)
        .then( results => {
          response.status(200).json(results.rows);
        })
        .catch (() => app.use((error, req, res) => {
          res.status(500).send(error);
        }));
        coordArray.push(latitude,longitude);
        console.log('insert into database',locationData);
        response.status(200).json(locationData);
    }).catch((err)=> errorHandler(err,request,response));
    }
  })
}



function weatherHandler(request,response){
    superagent(`https://api.weatherbit.io/v2.0/forecast/daily?city=${request.query.search_query}&key=${process.env.WEATHER_API_KEY}`).then(weatherRes=>{
      const weatherSummaries = weatherRes.body.data.map(day=>{
          return new Weather(day);
      })
      console.log(weatherSummaries);
      response.status(200).json(weatherSummaries);
    }).catch(err=>errorHandler(err,request,response));
}

function moviesHandler(request,response){
  superagent(`https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${request.query.search_query}`).then(movieResult =>{
  // console.log(movieResult.body.results);
  let movieList = movieResult.body.results.map(value=>{
    return new Movies(value)
  })
  console.log(movieList);
  response.status(200).json(movieList);
  }).catch(err=>errorHandler(err,request,response));
}

function yelpHandler(request,response){
  superagent(`https://api.yelp.com/v3/businesses/search?location=${request.query.search_query}`).set({"Authorization":`Bearer ${process.env.YELP_API_KEY}`}).then(result=>{
    let businesses= result.body.businesses.map(value=>{
      return new Business(value);
    })
    response.status(200).json(businesses);
  }).catch(err=>errorHandler(err,request,response));
}


function trailsHandler(request,response){
    superagent(`https://www.hikingproject.com/data/get-trails?lat=${coordArray[0]}&lon=${coordArray[1]}&maxDistance=200&key=${process.env.TRAIL_API_KEY}`).then(resp =>{
        const availableTrails = resp.body.trails.map(value=>{
            return new Trail(value);
        })
        response.status(200).json(availableTrails);
    }).catch(err=>errorHandler(err,request,response));
}



// HELPER FUNCTIONS
function notFoundHandler(request,response){
    response.status(404).send('Error 404: URL Not found.')
}
function errorHandler (error,request,response){
    response.status(500).send('SORRY AN ERROR OCCURED '+error);
}
function Location(city,geoData){
    this.search_query = city;
    this.formatted_query = geoData[0].display_name;
    this.latitude = geoData[0].lat;
    this.longitude = geoData[0].lon;
}
function Weather(data){
    this.forecast = data.weather.description;
    this.time = new Date(data.valid_date).toDateString();
}
function Trail(data){
    this.name = data.name;
    this.location = data.location;
    this.length = data.length;
    this.stars = data.stars;
    this.star_votes = data.starVotes;
    this.summary = data.summary;
    this.trail_url = data.url;
    this.conditions = data.conditionStatus;
    this.condition_date = data.conditionDate.split(' ')[0];
    this.condition_time = data.conditionDate.split(' ')[1];
}

function Movies(data){
  this.title = data.title;
  this.overview = data.overview;
  this.average_votes = data.vote_average;
  this.total_votes = data.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
  this.popularity = data.popularity;
  this.released_on = data.release_date;
}

function Business(data){
  this.name = data.name;
  this.image_url = data.image_url;
  this.price = data.price;
  this.rating = data.rating;
  this.url = data.url;
}

client
  .connect()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`my server is up and running on port ${PORT}`)
    );
  })
  .then(()=> client.query('select * from locations'))
  .then((result)=> console.log(result.row) )
  .catch((err) => {
    throw new Error(`startup error ${err}`);
  });
