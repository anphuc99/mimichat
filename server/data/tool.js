const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function removeAudioFields(value) {
	if (Array.isArray(value)) {
		return value.map(v => removeAudioFields(v));
	}
	if (value && typeof value === 'object') {
		// Create new object to avoid mutating original reference unexpectedly
		const cleaned = {};
		for (const [k, v] of Object.entries(value)) {
			if (k === 'audioData') {
				const uid = crypto.randomUUID()
				const audio = v
				cleaned[k] = uid
				fs.renameSync(__dirname + "/audio/" + audio + ".mp3", __dirname + "/audio/" + uid + ".mp3")
				continue
			}; // skip
			cleaned[k] = removeAudioFields(v);
		}
		return cleaned;
	}
	return value;
}

function main() {
    let json = JSON.parse(fs.readFileSync(__dirname + "/mimi-chat-journal.json", 'utf-8'));

	const cleaned = removeAudioFields(json);

	const outputPath = __dirname + "/mimi-chat-journal-no-audio.json";
	try {
		fs.writeFileSync(outputPath, JSON.stringify(cleaned, null, 2), 'utf-8');
		console.log('Done. Output written to', outputPath);
	} catch (e) {
		console.error('Failed to write output:', e.message);
		process.exit(1);
	}
}

function generateOutputName(input) {
	const dir = path.dirname(input);
	const base = path.basename(input, path.extname(input));
	return path.join(dir, base + '-no-audio' + path.extname(input));
}
main();