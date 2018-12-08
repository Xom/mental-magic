var seedrandom = require('seedrandom');
seedrandom(null, { global: true });

var firebase = require('firebase-admin');
var adminAccount = require('./XOMBOT_FIREBASE_SECRET.json');
firebase.initializeApp({
  credential: firebase.credential.cert(adminAccount),
  databaseURL: 'https://xombot-e72ae.firebaseio.com'
});
var f_root = firebase.database().ref();
var f_u = f_root.child('u');
var f_s = f_root.child('s');
var f_n = f_root.child('n');
var f_g = f_root.child('g');
function fu(uid) { return f_u.child(uid); }
function fs(key) { return f_s.child(key); }
function fn(cid) { return f_n.child(cid); }
function fg(gid) { return f_g.child(gid); }

function getVal(f_ref, callback, onError) {
  f_ref.once(
    'value',
    function onSuccess(snapshot) {
      callback(snapshot.val());
    },
    onError
  );
}

var Discord = require('discord.io');
var auth = require('./XOMBOT_SECRET.json');
var retries = 0;
var xombot = new Discord.Client({ token: auth.token });

var getToken = require('./XOMBOT_TOKEN.js');

var state;
getVal(f_s, function(s) {
  if (!s || !s.g) {
    console.warn('%s: Game not in progress! Stopping initialization!', new Date());
    process.exit(1);
  } else {
    state = s;
    xombot.connect();
  }
});

xombot.on('ready', function() {
  console.log('%s: Initialized as %s %s', new Date(), xombot.id, xombot.username);
});

xombot.on('disconnect', function(errMsg, code) {
  console.log('%s: Disconnected with code: %s; errMsg: %s', new Date(), code, errMsg);
  setTimeout(function() {
    retries++;
    xombot.connect();
  }, 586 << Math.min(retries, 9));
});

xombot.on('message', function(u, uid, cid, msg, evt) {
  console.log(evt); // TODO remove after migrating to #paperclips
  retries = 0;
  var data = evt.d;
  if (data.channel_id !== '520947962197573644'
    || data.content.slice(0, 1) !== '!'
    || data.author.id == xombot.id) {
    return;
  }
  switch(data.content.slice(1, 2)) {
    case ' ': return;
    case '!': return;
    case 'n': return;
    case 'u': return;
    case 'i': return info(data);
    case 'd': return;
    case 't': return;
    case 'g': return gameover(data);
    default: xombot.sendMessage({ to: data.channel_id, message: 'Invalid command.' });
  }
});

function gameover(data) {
  if (!data.content.startsWith('!gameover')) {
    xombot.sendMessage({ to: data.channel_id, message: 'Invalid command.' });
    return;
  }
  gameflip(state.g);
  var n = state.g.length;
  var c = state.g.slice(0, 1);
  if (c === 'z') {
    c = 'a';
    state = { g: 'a' };
  } else {
    c = String.fromCharCode(c.charCodeAt(0) + 1);
    state = { g: '' };
  }
  for (var i = 0; i < n; i++) {
    state.g += c;
  }
  f_s.set(state, function() {
    xombot.sendMessage({
      to: data.channel_id,
      message: 'New game `' + state.g + '` started by ' + data.author.username + '!'
    }, function() { announceTurn(data); });
  });
}

function gameflip(gid) {
  getVal(fg(gid).child('0'), function(v) {
    fg(gid).child('3').set(v);
  });
}

function announceTurn(data) {
  getVal(fs('p'), function(p) {
    xombot.sendMessage({
      to: data.channel_id,
      message: (p ? 'P2' : 'P1') + ' turn. Call dibs with `!dibs`\nFull README at <http://mm.xom.io>'
    });
  });
}

function info(data) {
  xombot.sendMessage({
    to: data.channel_id,
    message: 'Game `' + state.g + '`, P' + (state.p ? '2' : '1') + ' turn. '
      + (state.d ? state.d.name + ' has dibs on control.' : 'Call dibs with `!dibs`')
      + '\nFull README at <https://example.com/TODO_README_URL>'
  });
}

