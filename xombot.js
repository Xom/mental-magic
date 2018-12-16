var XOMBOT_CHANNEL = '369344620728942603';
var README = '\nFull README at <https://mm.xom.io>';
var BAD_COMMAND = 'Invalid command.';
var NO_DIBS = "You can't do that because you don't have dibs on control.";

var seedrandom = require('seedrandom');
seedrandom(null, { global: true });

var cards = [];
(function(){
  var i, j, k;
  var a = [24, 13, 18, 18, 15, 6, 6];
  var b = ['0', '1', '2', '3', '4', '5', '6'];
  for (i = 0; i <= 6; i++) {
    for (j = 0; j < a[i]; j++) {
      cards.push(b[i]);
    }
  }
  if (cards.length % 100) {
    console.warn('%s: Deck setup failed! Stopping initialization!', new Date());
    process.exit(1);
  }
  a = [15, 20, 20, 12, 6, 3, 6, 7, 7, 4];
  b = [
    ['W', '1W', '2W', '3W', '4W', 'WW', '1WW', '2WW', '3WW', '4WW'],
    ['U', '1U', '2U', '3U', '4U', 'UU', '1UU', '2UU', '3UU', '4UU'],
    ['B', '1B', '2B', '3B', '4B', 'BB', '1BB', '2BB', '3BB', '4BB'],
    ['R', '1R', '2R', '3R', '4R', 'RR', '1RR', '2RR', '3RR', '4RR'],
    ['G', '1G', '2G', '3G', '4G', 'GG', '1GG', '2GG', '3GG', '4GG']
  ];
  for (k = 0; k < 5; k++) {
    for (i = 0; i < 10; i++) {
      for (j = 0; j < a[i]; j++) {
        cards.push(b[k][i]);
      }
    }
    if (cards.length % 100) {
      console.warn('%s: Deck setup failed! Stopping initialization!', new Date());
      process.exit(1);
    }
  }
}());
function card() { return cards[Math.floor(Math.random() * 600)]; }

var BASIC = { 'utopia': true, 'plains': true, 'island': true, 'swamp': true, 'mountain': true, 'forest': true };
var btb = /[^a-zA-Z]/g;
function alphalower(s) {
  return s.replace(btb, '').toLowerCase();
}

var firebase = require('firebase-admin');
var adminAccount = require('./XOMBOT_FIREBASE_SECRET.json');
firebase.initializeApp({
  credential: firebase.credential.cert(adminAccount),
  databaseURL: 'https://xombot-e72ae.firebaseio.com'
});
var f_root = firebase.database().ref();
var f_s = f_root.child('s');
var f_n = f_root.child('n');
var f_g = f_root.child('g');
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
  retries = 0;
  var data = evt.d;
  if (data.channel_id !== XOMBOT_CHANNEL || data.content.slice(0, 1) !== '!' || data.author.bot) {
    return;
  }
  switch(data.content.slice(1, 2)) {
    case ' ': return pull(data);
    case '!': return flip(data);
    case 'n': return name(data);
    case 'u': return utopia(data);
    case 'i': return info(data);
    case 'd': return dibs(data);
    case 't': return turnover(data);
    case 'g': return gameover(data);
    case 'r': return roll(data);
    default: xombot.sendMessage({ to: data.channel_id, message: BAD_COMMAND });
  }
});

function gameover(data) {
  if (!data.content.startsWith('!gameover')) {
    xombot.sendMessage({ to: data.channel_id, message: BAD_COMMAND });
    return;
  }
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

function announceTurn(data) {
  xombot.sendMessage({
    to: data.channel_id,
    message: (state.p ? 'P2' : 'P1') + ' turn. Call dibs with `!dibs`' + README
  });
}

function info(data) {
  xombot.sendMessage({
    to: data.channel_id,
    message: 'Game `' + state.g + '`, P' + (state.p ? '2' : '1') + ' turn. ' + (state.d ? state.d.name + ' has dibs on control.' : 'Call dibs with `!dibs`') + README
  });
}

var dd = null; // dibs destroyer XD
function dibs(data) {
  if (!data.content.startsWith('!dibs')) {
    xombot.sendMessage({ to: data.channel_id, message: BAD_COMMAND });
    return;
  }
  if (state.d) {
    var ts = Date.now();
    if (dd && ts - dd.t < 30000 && dd.u == data.author.id) {
      fs('d').set(state.d, function() {
        state.d = null;
        dd = null;
        xombot.sendMessage({
          to: data.channel_id,
          message: 'Dibs reset. Call dibs with `!dibs`'
        });
      });
      return;
    }
    dd = { u: data.author.id, t: ts };
    xombot.sendMessage({
      to: data.channel_id,
      message: state.d.name + ' already called dibs. To reset dibs, repeat `!dibs`'
    });
    return;
  }
  var myToken = getToken(data.author.id);
  var f_team = fg(state.g).child('t').child(myToken);
  getVal(f_team, function(team) {
    if (!team) {
      team = state.p ? 2 : 1;
      f_team.set(team);
      xombot.sendMessage({
        to: data.author.id,
        message: 'Welcome to game `' + state.g + '` P' + team + ' team. Your password for <https://mm.xom.io> is `' + myToken + '`'
      });
    }
    if (team == (state.p ? 2 : 1)) {
      state.d = { id: data.author.id, name: data.author.username };
      fs('d').set(state.d, function() {
        xombot.sendMessage({
          to: data.channel_id,
          message: (state.p ? 'P2' : 'P1') + ' turn. ' + state.d.name + ' called dibs on control.'
        });
      });
    } else {
      xombot.sendMessage({
        to: data.channel_id,
        message: "You can't call dibs because you're already on the other team."
      });
    }
  });
}

function turnover(data) {
  if (!data.content.startsWith('!turnover')) {
    xombot.sendMessage({ to: data.channel_id, message: BAD_COMMAND });
    return;
  }
  if (!state.d || state.d.id !== data.author.id) {
    xombot.sendMessage({ to: data.channel_id, message: NO_DIBS });
    return;
  }
  state = { g: state.g, p: !state.p };
  f_s.set(state, function() {
    announceTurn(data);
  });
}

function pull(data) {
  if (!state.d || state.d.id !== data.author.id) {
    xombot.sendMessage({ to: data.channel_id, message: NO_DIBS });
    return;
  }
  var i = data.content.indexOf('#');
  var s = data.content.slice(2, i === -1 ? undefined : i).split(' ');
  var comment = i === -1 ? null : data.content.slice(i);
  var a = [];
  var n = s.length;
  var x;
  for (i = 0; i < n; i++) {
    x = parseInt(s[i]);
    if (x >= 0 && x <= 999) {
      a.push(x >= 100 ? x : x + (state.p ? 200 : 100));
    }
  }
  if (!a.length) {
    xombot.sendMessage({ to: data.channel_id, message: 'Invalid number(s).' });
    return;
  }
  getVal(fg(state.g).child('3'), function(v) {
    var u = {
      pt: new Date(data.timestamp).getTime(),
      pu: data.author.id,
      pn: data.author.username,
      pc: comment
    };
    var uu = {};
    var uuu = {};
    n = a.length;
    for (i = 0; i < n; i++) {
      if (v && v[a[i]]) {
        xombot.sendMessage({
          to: data.channel_id,
          message: '`' + state.g + a[i] + '` was already PULL\'d. Did you mean to FLIP?'
        });
        return;
      }
      uu[a[i]] = u;
      uuu[a[i]] = card();
    }
    fg(state.g).child('0').update(uu, function() {
      fg(state.g).child(state.p ? '2' : '1').update(uuu, function() {
        fg(state.g).child('3').update(uuu, function() {
          xombot.sendMessage({ to: data.channel_id, message: 'OK' });
        });
      });
    });
  });
}

function flip(data) {
  if (!state.d || state.d.id !== data.author.id) {
    xombot.sendMessage({ to: data.channel_id, message: NO_DIBS });
    return;
  }
  var i = data.content.indexOf('#');
  var s = data.content.slice(2, i === -1 ? undefined : i).split(' ');
  var comment = i === -1 ? null : data.content.slice(i);
  var a = [];
  var n = s.length;
  var x;
  for (i = 0; i < n; i++) {
    x = parseInt(s[i]);
    if (x >= 0 && x <= 999) {
      a.push(x >= 100 ? x : x + (state.p ? 200 : 100));
    }
  }
  if (!a.length) {
    xombot.sendMessage({ to: data.channel_id, message: 'Invalid number(s).' });
    return;
  }
  getVal(fg(state.g).child('0'), function(v) {
    getVal(fg(state.g).child('3'), function(w) {
      var ft = new Date(data.timestamp).getTime();
      var uu = {};
      var uuu = {};
      var message = '```';
      n = a.length;
      for (i = 0; i < n; i++) {
        if (v && v[a[i]]) {
          message += '\n' + a[i] + ': ' + w[a[i]];
          if (v[a[i]].f) {
            continue;
          }
          uuu[a[i]] = w[a[i]];
        } else {
          uuu[a[i]] = card();
          message += '\n' + a[i] + ': ' + uuu[a[i]];
        }
        uu[a[i] + '/ft'] = ft;
        uu[a[i] + '/fu'] = data.author.id;
        uu[a[i] + '/fn'] = data.author.username;
        uu[a[i] + '/fc'] = comment;
        uu[a[i] + '/f'] = uuu[a[i]];
      }
      message += '```';
      fg(state.g).child('0').update(uu, function() {
        fg(state.g).child('3').update(uuu, function() {
          xombot.sendMessage({ to: data.channel_id, message: message });
        });
      });
    });
  });
}

function name(data) {
  if (!state.d || state.d.id !== data.author.id) {
    xombot.sendMessage({ to: data.channel_id, message: NO_DIBS });
    return;
  }
  var i = data.content.indexOf('#');
  var s = data.content.slice(2, i === -1 ? undefined : i).trim();
  var j = s.indexOf(' ');
  var x = parseInt(s.slice(0, j));
  if (x >= 0 && x <= 999) {
    if (x < 100) {
      x += state.p ? 200 : 100;
    }
  } else {
    xombot.sendMessage({ to: data.channel_id, message: 'Invalid number.' });
    return;
  }
  var cardname = s.slice(j).trim();
  var cardlower = alphalower(cardname);
  if (!cardlower.length) {
    xombot.sendMessage({ to: data.channel_id, message: 'Invalid cardname.' });
    return;
  }
  var comment = i === -1 ? null : data.content.slice(i);
  getVal(fg(state.g).child('0').child(x), function(v) {
    if (v && v.n) {
      xombot.sendMessage({
        to: data.channel_id,
        message: '`' + state.g + x + '` was already named `' + v.n + '`'
      });
      return;
    }
    getVal(fn(cardlower), function(obj) {
      if (obj && !(comment && comment.startsWith('#force'))) {
        var message = 'Similar cardnames found in history. To override, begin comment with `#force`\n```';
        for (var cid in obj) {
          message += '\n' + cid + ': ' + obj[cid];
        }
        message += '```';
        xombot.sendMessage({ to: data.channel_id, message: message });
        return;
      }
      getVal(fg(state.g).child('3').child(x), function(w) {
        var u = {
          nt: new Date(data.timestamp).getTime(),
          nu: data.author.id,
          nn: data.author.username,
          nc: comment,
          n: cardname
        };
        if (!w) {
          fg(state.g).child('0').child(x).set(u, function() {
            xombot.sendMessage({
              to: data.channel_id,
              message: 'OK, `' + state.g + x + ' := ' + cardname + '`, though no mana cost was ever generated for it.'
            });
            if (!BASIC[cardlower]) {
              fn(cardlower).child(state.g + x).set(cardname);
            }
          });
          return;
        }
        if (!v.f && cardlower !== 'utopia') {
          u.fc = '#!n';
          u.f = w;
        }
        fg(state.g).child('0').child(x).update(u, function() {
          xombot.sendMessage({
            to: data.channel_id,
            message: 'OK, `' + state.g + x + (cardlower === utopia && !v.f ? '' : ' [' + w + ']') + ' := ' + cardname + '`'
          });
          if (!BASIC[cardlower]) {
            fn(cardlower).child(state.g + x).set(cardname);
          }
        });
      });
    });
  });
}

function utopia(data) {
  if (!state.d || state.d.id !== data.author.id) {
    xombot.sendMessage({ to: data.channel_id, message: NO_DIBS });
    return;
  }
  var i = data.content.indexOf('#');
  var x = parseInt(data.content.slice(2, i === -1 ? undefined : i).trim());
  if (x >= 0 && x <= 999) {
    if (x < 100) {
      x += state.p ? 200 : 100;
    }
  } else {
    xombot.sendMessage({ to: data.channel_id, message: 'Invalid number.' });
    return;
  }
  var comment = i === -1 ? null : data.content.slice(i);
  getVal(fg(state.g).child('0').child(x), function(v) {
    if (v && v.n) {
      xombot.sendMessage({
        to: data.channel_id,
        message: '`' + state.g + x + '` was already named `' + v.n + '`'
      });
      return;
    }
    var u = {
      nt: new Date(data.timestamp).getTime(),
      nu: data.author.id,
      nn: data.author.username,
      nc: comment,
      n: 'Utopia'
    };
    fg(state.g).child('0').child(x).update(u, function() {
      xombot.sendMessage({
        to: data.channel_id,
        message: 'OK, `' + state.g + x + (v && v.f ? ' [' + v.f + ']' : '') + ' := Utopia`'
      });
    });
  });
}

function roll(data) {
  var i = data.content.indexOf('#');
  var s = data.content.slice(2, i === -1 ? undefined : i).split(' ');
  var a = [];
  var n = s.length;
  var x;
  for (i = 0; i < n; i++) {
    x = s[i].trim();
    if (x.length) {
      a.push(x);
    }
  }
  if (!a.length) {
    xombot.sendMessage({ to: data.channel_id, message: '`!r` requires a number, or a space-delimited list of choices' });
    return;
  }
  if (a.length === 1) {
    x = parseInt(a[0]);
    xombot.sendMessage({
      to: data.channel_id,
      message: x >= 1 ? (data.author.username + ' rolled ' + Math.floor(Math.random() * x + 1)) : 'Invalid number.'
    });
    return;
  }
  xombot.sendMessage({
    to: data.channel_id,
    message: data.author.username + ' randomed, out of ' + a.length + ' items: ' + a[Math.floor(Math.random() * a.length)]
  });
}

