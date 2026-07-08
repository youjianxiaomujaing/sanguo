// Fix all question files: shuffle options so correct answer isn't always B
// Also add random jitter to prevent answer-length patterns

const fs = require('fs');

// Use a deterministic but varied seed per question
// Based on position in file to ensure variety but reproducibility
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function shuffleOptions(question, fileIndex, questionIndex) {
  const rng = seededRandom(fileIndex * 30000 + questionIndex * 71 + 98765);
  const options = [...question.options];
  const correctIdx = question.answer;
  const correctText = options[correctIdx];

  // Fisher-Yates shuffle with seeded RNG
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  // Find where correct answer landed
  const newCorrectIdx = options.findIndex(o => o === correctText);

  return { options, answer: newCorrectIdx };
}

function processFile(filename, fileIndex) {
  console.log('\n=== Processing ' + filename + ' ===');
  let content = fs.readFileSync(filename, 'utf8');

  // Extract the array
  // Find the start of the question data
  const lines = content.split('\n');
  const newLines = [];

  let questionCount = 0;
  let modifiedCount = 0;
  let answerDist = [0, 0, 0, 0];  // Track distribution of correct answers

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match lines that define question options
    // Pattern: ...options: [...], answer: N, ...
    const optMatch = line.match(/^(.*options:)\s*(\[[^\]]*\])\s*,\s*answer:\s*(\d+)\s*,\s*(.*)$/);
    if (!optMatch) {
      newLines.push(line);
      continue;
    }

    const prefix = optMatch[1];
    const optionsStr = optMatch[2];
    const oldAnswer = parseInt(optMatch[3]);
    const suffix = optMatch[4];

    try {
      // Parse options array - they're single-quoted strings
      let options;
      try {
        options = JSON.parse(optionsStr.replace(/'/g, '"'));
      } catch (e) {
        // Manual parse
        const cleaned = optionsStr.slice(1, -1); // remove [ ]
        // Split by ', ' but respect nested quotes
        options = [];
        let current = '';
        let inQuote = false;
        for (let j = 0; j < cleaned.length; j++) {
          const ch = cleaned[j];
          if (ch === "'" && (j === 0 || cleaned[j-1] !== '\\')) {
            inQuote = !inQuote;
            if (!inQuote) {
              options.push(current);
              current = '';
              continue;
            }
            continue;
          }
          if (inQuote) {
            current += ch;
          }
        }
        if (current) options.push(current);
      }

      if (!options || options.length < 4) {
        newLines.push(line);
        continue;
      }

      const correctText = options[oldAnswer];

      // Shuffle
      const { options: newOptions, answer: newAnswer } = shuffleOptions(
        { options, answer: oldAnswer }, fileIndex, questionCount
      );

      answerDist[newAnswer] = (answerDist[newAnswer] || 0) + 1;
      questionCount++;

      if (oldAnswer !== newAnswer) modifiedCount++;

      // Rebuild the line
      const newOptionsStr = '[' + newOptions.map(o => "'" + o + "'").join(',') + ']';
      const newLine = prefix + newOptionsStr + ',answer:' + newAnswer + ',' + suffix;
      newLines.push(newLine);

    } catch (e) {
      console.log('  ERROR line ' + (i+1) + ': ' + e.message);
      newLines.push(line);
    }
  }

  console.log('  Questions: ' + questionCount);
  console.log('  Shuffled: ' + modifiedCount + ' (correct answer moved)');
  console.log('  New distribution: A=' + answerDist[0] + ' B=' + answerDist[1] + ' C=' + answerDist[2] + ' D=' + answerDist[3]);

  fs.writeFileSync(filename, newLines.join('\n'), 'utf8');
  return { questionCount, modifiedCount };
}

const files = [
  'questions-novel.js',
  'questions-novel-extra.js',
  'questions-history.js',
  'questions-history-extra.js'
];

let totalQuestions = 0;
let totalModified = 0;

for (let i = 0; i < files.length; i++) {
  const result = processFile(files[i], i);
  totalQuestions += result.questionCount;
  totalModified += result.modifiedCount;
}

console.log('\n=== SUMMARY ===');
console.log('Total questions: ' + totalQuestions);
console.log('Shuffled: ' + totalModified);

// Verify all files parse
const { execSync } = require('child_process');
console.log('\n=== VERIFY ===');
for (const f of files) {
  try {
    execSync('node --check ' + f, { cwd: __dirname, stdio: 'pipe' });
    console.log('✅ ' + f);
  } catch(e) {
    console.log('❌ ' + f);
  }
}
