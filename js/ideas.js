/* habeet ideas: ready-made habits people can add with one tap.
   Each idea: name (max 40 characters), icon (one of the form's icons), color 0-6, part 0 morning / 1 afternoon / 2 evening,
   days (optional, 0 = Sunday), kind (optional: 'time' with goal in minutes, or 'count' with goal and unit).
   Keep names short and leave numbers out of the name when the goal is set, so editing the goal never contradicts it. */
(function (root) {
  'use strict';
  var ALL = [0, 1, 2, 3, 4, 5, 6], WEEK = [1, 2, 3, 4, 5], END = [0, 6];
  root.HabeetIdeas = [
    { cat: 'Body', items: [
      { name: 'Drink water', icon: 'water', color: 3, part: 0, kind: 'count', goal: 8, unit: 'glasses' },
      { name: 'Exercise', icon: 'dumbbell', color: 0, part: 0, days: [1, 2, 3, 4, 5, 6], kind: 'time', goal: 30 },
      { name: 'Go for a walk', icon: 'run', color: 2, part: 1, kind: 'time', goal: 20 },
      { name: 'Stretch', icon: 'leaf', color: 2, part: 0, kind: 'time', goal: 5 },
      { name: 'Eat fruit or vegetables', icon: 'heart', color: 0, part: 1, kind: 'count', goal: 3, unit: 'portions' },
      { name: 'Sleep before 11pm', icon: 'moon', color: 5, part: 2 },
      { name: 'No sugary drinks', icon: 'water', color: 4, part: 1 }
    ] },
    { cat: 'Mind', items: [
      { name: 'Meditate', icon: 'lotus', color: 6, part: 0, kind: 'time', goal: 10 },
      { name: 'Write in a journal', icon: 'pen', color: 1, part: 2 },
      { name: 'Write 3 things I am grateful for', icon: 'heart', color: 6, part: 2 },
      { name: 'Pray or reflect', icon: 'lotus', color: 5, part: 0 },
      { name: 'No phone for the first hour', icon: 'sun', color: 1, part: 0 },
      { name: 'Take a screen break', icon: 'moon', color: 3, part: 1 },
      { name: 'Plan tomorrow tonight', icon: 'pen', color: 4, part: 2 }
    ] },
    { cat: 'Learning', items: [
      { name: 'Read', icon: 'book', color: 4, part: 2, kind: 'time', goal: 20 },
      { name: 'Study', icon: 'book', color: 5, part: 1, days: WEEK, kind: 'time', goal: 60 },
      { name: 'Practice coding', icon: 'code', color: 5, part: 1, days: WEEK, kind: 'time', goal: 60 },
      { name: 'Learn new words', icon: 'book', color: 3, part: 0, kind: 'count', goal: 5, unit: 'words' },
      { name: 'Listen to a podcast or lesson', icon: 'star', color: 1, part: 1 },
      { name: 'Watch one tutorial', icon: 'code', color: 4, part: 2, days: WEEK },
      { name: 'Revise today\'s notes', icon: 'pen', color: 2, part: 2, days: WEEK }
    ] },
    { cat: 'Work', items: [
      { name: 'Do the hardest task first', icon: 'star', color: 0, part: 0, days: WEEK },
      { name: 'Deep work', icon: 'code', color: 5, part: 0, days: WEEK, kind: 'time', goal: 90 },
      { name: 'Clear my inbox', icon: 'pen', color: 4, part: 1, days: WEEK },
      { name: 'Ship one small thing', icon: 'code', color: 2, part: 1, days: WEEK },
      { name: 'Write down the top 3 tasks', icon: 'pen', color: 1, part: 0, days: WEEK },
      { name: 'Reach out to one person', icon: 'heart', color: 6, part: 1, days: WEEK },
      { name: 'Review the week', icon: 'book', color: 3, part: 2, days: [5] }
    ] },
    { cat: 'Money', items: [
      { name: 'Save a little money', icon: 'star', color: 1, part: 2 },
      { name: 'Write down what I spent', icon: 'pen', color: 2, part: 2 },
      { name: 'No impulse buying', icon: 'heart', color: 0, part: 1 },
      { name: 'Check my budget', icon: 'book', color: 4, part: 0, days: [1] },
      { name: 'Learn one money idea', icon: 'book', color: 5, part: 1 }
    ] },
    { cat: 'Home', items: [
      { name: 'Make my bed', icon: 'sun', color: 1, part: 0 },
      { name: 'Tidy up', icon: 'leaf', color: 2, part: 2, kind: 'time', goal: 10 },
      { name: 'Wash the dishes', icon: 'water', color: 3, part: 2 },
      { name: 'Cook a home meal', icon: 'heart', color: 0, part: 2 },
      { name: 'Laundry day', icon: 'leaf', color: 4, part: 1, days: END },
      { name: 'Prepare tomorrow\'s clothes', icon: 'moon', color: 5, part: 2 }
    ] },
    { cat: 'People', items: [
      { name: 'Call or text someone I love', icon: 'heart', color: 6, part: 1 },
      { name: 'Say thank you to someone', icon: 'heart', color: 0, part: 1 },
      { name: 'Spend time with family', icon: 'heart', color: 1, part: 2 },
      { name: 'Do one kind thing', icon: 'star', color: 3, part: 1 },
      { name: 'Meet a friend', icon: 'run', color: 2, part: 1, days: END }
    ] }
  ];
})(self);
