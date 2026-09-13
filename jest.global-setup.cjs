// Every test runs in a time zone with daylight saving, whatever the machine or
// CI runner uses, so date bugs show up everywhere and results do not depend on
// where the tests run.
//
// It has to be set here, before Jest starts its workers: test files get their
// own copy of process.env, so setting TZ inside a test changes nothing.
module.exports = () => {
  process.env.TZ = 'Europe/London';
};
