'use strict'

const fs = require('fs')
const Twit = require('twit')
const uuid = require('uuid')
const winston = require('winston')
const MarkovChain = require('markovchain').MarkovChain

const dir = './data/'
const stored = `${dir}store.txt`
const flat = `${dir}flat.txt`
const logs = './logs/'
const results = `${logs}/results.log`
const start = +new Date()

const cfgProcess = require('./process.json')
const cfg = {
	consumer_key : cfgProcess.apps[0].env.CONSUMER_KEY,
	consumer_secret : cfgProcess.apps[0].env.CONSUMER_SECRET,
	access_token : cfgProcess.apps[0].env.ACCESS_TOKEN,
	access_token_secret : cfgProcess.apps[0].env.ACCESS_TOKEN_SECRET
}

const res = new (winston.Logger)({
	transports: [
		new (winston.transports.Console)(),
		new (winston.transports.File)({ filename: results })
	]
})

const twit = new Twit(cfg)

if (!fs.existsSync(stored)) {
	fs.writeFileSync(stored, '', 'utf8')
}
if (!fs.existsSync(flat)) {
	fs.writeFileSync(flat, '', 'utf8')
}

const idsRaw = fs.readFileSync(stored, 'utf8').split('\n')
const ids = idsRaw.map(obj => { return obj.split(',')[0] })
let mostRecent

function flag (name = null) {
	let single
	if (name === null) {
		return process.argv
	} else {
		single = name[0] //first letter of full-length flag name
		if (process.argv.indexOf(`-${single}`) !== -1 || process.argv.indexOf(`--${name}`) !== -1) {
			return true
		} else {
			return false
		} 
	}
}

/*
 * favorites/list.json = 75 reqs per 15min windows
 * @param: count max 200
 *
 */
const favPath = 'favorites/list'
function getFavs () {
	res.info('started', {found : ids.length} )
	if (flag('file')) {
		return runMarkov()
	}
	twit.get(favPath, { count : 200 }, (err, data, response) => {
		if (err) return console.error(err)
		let nextPage = false
		console.log(`Path ${favPath} responded with code ${response.statusCode}`)
		console.log(`Found ${data.length} / 200`)
		for (let obj of data) {
			if (ids.indexOf(obj.idStr) === -1) {
				nextPage = obj.id
				ids.push(obj.id)
				fs.appendFileSync(stored, `${obj.id},${obj.text}\n`, 'utf8')
				fs.appendFileSync(flat, `${obj.text}\n`, 'utf8')
			}
		}
		if (nextPage) {
			let ms = (15 * 60 * 1000) / 60 // a little longer than 15min/75
			console.log(`Next request in ${ms}ms`)
			return setTimeout(() => { getFavsPages(nextPage, runMarkov) }, ms)
		}
		//console.log(response)
		runMarkov()
	})
}
function getFavsPages (id, cb) {
	let nextPage = false
	twit.get(favPath, { count : 200,  max_id : id}, (err, data, response) => {
		if (err) return console.error(err)
		let nextPage = false
		console.log(`Path ${favPath} responded with code ${response.statusCode}`)
		console.dir(`Found ${data.length} / 200`)
		for (let obj of data) {
			//console.log(`${obj.id}`)
			//console.log(`${obj.text}`)
			if (ids.indexOf(obj.id) === -1) {
				nextPage = obj.id
				ids.push(obj.id)
				fs.appendFileSync(stored, `${obj.id},${obj.text}\n`, 'utf8')
				fs.appendFileSync(flat, `${obj.text}\n`, 'utf8')
			}
		}
		if (nextPage) {
			let ms = (15 * 60 * 1000) / 60 // a little longer than 15min/75
			console.log(`Next request in ${ms}ms`)
			return setTimeout(() => { getFavsPages(nextPage, cb) }, ms)
		}
	})
}

function getRandomArbitrary (min, max) {
    return Math.random() * (max - min) + min
}

function runMarkov () {
	const time = +new Date()
	const minWords = 8
	const maxWords = 30
	const markov = new MarkovChain({ 
		files: flat 
	})
	markov.start( wordList => {
		const tmpList = Object.keys(wordList).filter(word => { 
			return word[0] >= 'A' && word[0] <= 'Z' 
		})
		return tmpList[~~(Math.random() * tmpList.length)]
	}).end(getRandomArbitrary(minWords, maxWords)).process((err, s) => {
		const last = s[s.length - 1]
		if (last !== '?' &&
			last !== '.' &&
			last !== '!') {
			s += '.'
		}
		if (last === ',') {
			s[s.length - 1] = '.'
		}
		res.info('markov', {id : uuid.v4(), tweet: s, time: (+new Date() - time) })
		return sendTweet(s)
	})
}

function sendTweet (tweet) {
	tweet = processTweet(tweet)
	if (flag('silent')) {
		return console.log(tweet)
	}
	//send using twit API
	//console.log(tweet)
	return twit.post('statuses/update', { status: tweet }, (err, data, response) => {
		if (err) {
			return res.error('sendTweet', { error : err })
		}
		//console.log(response)
  		res.info('status/update', { statusCode : response.statusCode, data : data })
  		res.info('sendTweet', { id : uuid.v4(), tweet : tweet, time : (+new Date() - start) })
  		return process.exit()
	})
}

function processTweet (tweet) {
	//TODO: render image of referenced tweet, skip for now and re-run
	//if (tweet.indexOf('twitter.com/') !== -1 || tweet.indexOf('://t.co/') !== -1) {
	//	res.warn('processTweet', 'Contained tweet link, rerunning')
	//	return runMarkov()
	//}
	if (tweet === undefined || tweet === 'undefined' || typeof tweet === 'undefined') {
		res.warn('processTweet', 'Tweet was undefined, rerunning')
		return runMarkov()
	}

	tweet = cleanTweet(tweet)
	return tweet
}

function cleanTweet (tweet) {
	//Replace @'s with @  to prevent spamming people
	const atRe = new RegExp('@', 'g')
	tweet = tweet.replace(atRe, '○') //use &cir; instead of @

	return tweet
}

getFavs()