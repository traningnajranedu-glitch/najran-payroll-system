const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const compiled = ts.transpileModule(fs.readFileSync('lib/achievement.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const context = {exports: {}, Intl, Date};
vm.runInNewContext(compiled, context);
const {validateAssessment, riyadhDate} = context.exports;
const valid = {academic_year:'1448',semester:'الأول',stage:'ابتدائي',grade:'الأول',subject:'الرياضيات',evaluation_type:'ختامي',evaluation_date:riyadhDate(),registered_count:'50',assessed_count:'50',passed_count:'45',mastered_count:'40',total_scores:'4000',max_score:'100'};
assert.equal(validateAssessment(valid), '');
for (const invalid of [
 {assessed_count:'0'}, {assessed_count:'51'}, {assessed_count:'3.5'},
 {mastered_count:'51'}, {passed_count:'51'}, {total_scores:'5001'},
 {max_score:'0'}, {registered_count:''}, {total_scores:''},
 {total_scores:'NaN'}, {academic_year:'1448-1449'}, {evaluation_date:'2099-01-01'},
]) assert.notEqual(validateAssessment({...valid,...invalid}), '', JSON.stringify(invalid));
assert.equal(validateAssessment({...valid,mastered_count:'0',passed_count:'0',total_scores:'0'}),'', 'Real zero attainment must be allowed.');
console.log('PASS: valid input and zero attainment accepted; impossible counts, scores, dates and missing data rejected.');
