require('./patterns.js');
const phMobilePattern = TRUSTPROMPT_PATTERNS.find(p => p.id === 'ph_mobile');
const testCases = [
  '0909 834 0056',
  '+63 909 834 0056',
  '09098340056',
  '09-09-834-0056',
  '+639098340056',
  '09 09 834 0056'
];

console.log('Testing ph_mobile pattern:');
testCases.forEach(test => {
  const match = test.match(phMobilePattern.regex);
  console.log(`'${test}' => ${match ? 'MATCHED' : 'NOT MATCHED'}`);
});
