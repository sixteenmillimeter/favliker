'use strict'

const fs = require('fs')
const Twit = require('twit')
const winston = require('winston')
const MarkovChain = require('markovchain').MarkovChain

const dir = './data/'
const stored = `${dir}store.txt`
const flat = `${dir}flat.txt`
const logs = './logs/'
const results = `${logs}/results.log`

const cfgProcess = JSON.parse(fs.readFileSync('./process.json'))
const cfg = {
	consumer_key : cfgProcess.apps[0].env.CONSUMER_KEY,
	consumer_secret : cfgProcess.apps[0].env.CONSUMER_SECRET,
	access_token : cfgProcess.apps[0].env.ACCESS_TOKEN,
	access_token_secret : cfgProcess.apps[0].env.ACCESS_TOKEN_SECRET
}

const res = new (winston.Logger)({
	transports: [
		//new (winston.transports.Console)(),
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
const ids = idsRaw.map(obj => { return obj.split(',')[0]; })
let mostRecent

console.log(`${ids.length} tweets found in storage`)

/*
 * favorites/list.json = 75 reqs per 15min windows
 * @param: count max 200
 *
 */
const favPath = 'favorites/list'
const getFavs = () => {
	if (process.argv.indexOf('-f') !== -1 || process.argv.indexOf('--flat') !== -1) {
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
const getFavsPages = (id, cb) => {
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

const getRandomArbitrary = (min, max) => {
    return Math.random() * (max - min) + min
}

const runMarkov = () => {
	console.time('markov')
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
		console.timeEnd('markov')
		console.log(s)
		res.info(s)
	})
}

getFavs()