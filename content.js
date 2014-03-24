// Content scripts run in isolated world, we don't have access to any libraries
function ge(e) {
  return document.getElementById(e);
}
function geByClass(c, n) {
  return Array.prototype.slice.call((n || document).getElementsByClassName(c));
}
function geByClass1(c, n) {
  return (n || document).getElementsByClassName(c)[0];
}
function getRegexp(rule) {
  if (!rule.compiled) {
    rule.compiled = new RegExp(rule.template);
  }

  return rule.compiled;
}
function getKeywords(rule) {
  if (!rule.compiled) {
    rule.compiled = [];
    var phrase = [];
    var keyword = { exact: false, text: '' };
    for (var i = 0; i < rule.template.length; i++) {
      var ch = rule.template.charAt(i);
      if (!keyword.exact && ch == ',') { // start of new phrase
        if (keyword.text.trim()) {
          phrase.push(keyword);
        }
        if (phrase.length) {
          rule.compiled.push(phrase);
        }

        phrase = [];
        keyword = { exact: false, text: '' };
      } else
      if (ch == '"' || (!keyword.exact && ch == ' ')) { // start of new keyword
        if (keyword.text.trim()) {
          phrase.push(keyword);
        }

        keyword = { exact: (ch == '"') && !keyword.exact, text: '' };
      } else {
        keyword.text += keyword.exact ? ch : ch.toLocaleLowerCase();
      }
    }
    if (keyword.text.trim()) {
      phrase.push(keyword);
    }
    if (phrase.length) {
      rule.compiled.push(phrase);
    }
  }

  return rule.compiled;
}
function update(list) {
  list = list || ge('page_wall_posts') || ge('feed_rows') || ge('results') || document.body;

  geByClass('post', list).forEach(function(post) {
    if (post.processed || opened[post.id] == 3) {
      return;
    }

    var hideBody = 0;
    var hideComments = 0;

    var appliedRules = [];

    var postText = geByClass('wall_post_text', post);
    postText.forEach(function(text) {
      var str = text.innerText;
      var strLow = str.toLocaleLowerCase();
      rules.forEach(function(rule) {
        if (rule.enabled) {
          var apply = false;
          if (rule.regexp) {
            apply = !!str.match(getRegexp(rule));
          } else {
            var keywords = getKeywords(rule);

            keywords.forEach(function(phrase) {
              var found = true;
              phrase.forEach(function(keyword) {
                if ((keyword.exact ? str : strLow).indexOf(keyword.text) == -1) {
                  found = false;
                }
              });

              if (found) {
                apply = true;
              }
            });
          }

          if (apply) {
            hideBody = Math.max(hideBody, rule.posts);
            hideComments = Math.max(hideComments, rule.comments);
            if (rule.name) {
              appliedRules.push('<b>' + rule.name + '</b>');
            }
          }
        }
      });
    });

    if ((opened[post.id] & 1) != 0) {
      hideBody = 0;
    }
    if ((opened[post.id] & 2) != 0) {
      hideComments = 0;
    }

    var appliedRulesText = appliedRules.length > 0 ? (appliedRules.length > 1 ? ' (правила ' : ' (правило ') + appliedRules.join(', ') + ')' : '';

    var postBody = geByClass1('wall_text', post);
    var postComments = geByClass1('replies_wrap', post);

    if (hideBody == 2) { // totally remove post
      post.style.display = 'none';
      return;
    }

    if (hideBody) {
      var old = [];
      for (var i = 1; i < postBody.children.length; i++) {
        old[i] = postBody.children[i].style.display;
        postBody.children[i].style.display = 'none';
      }
      postBody.children[1].insertAdjacentHTML('beforebegin', '<a class="wr_header"><div class="wrh_text">Запись скрыта' + appliedRulesText + '</div></a>');
      var bodySpoiler = postBody.children[1];
      bodySpoiler.onclick = function() {
        for (var i = 1; i < postBody.children.length; i++) {
          postBody.children[i].style.display = old[i] || 'block';
        }
        var state = 1;
        if (hideComments == 1 && postComments) {
          postComments.style.display = 'block';
          state = 3;
        }
        bodySpoiler.style.display = 'none';

        opened[post.id] = opened[post.id] | state;
        chrome.extension.sendRequest({method: "setOpened", id: post.id, state: state});
      }
    }

    if (hideComments && postComments) {
      postComments.style.display = 'none';

      if (!hideBody && hideComments != 2) {
        postComments.insertAdjacentHTML('beforebegin', '<a class="wr_header"><div class="wrh_text">Комментарии скрыты' + appliedRulesText + '</div></a>');
        var commentsSpoiler = postComments.previousElementSibling;
        commentsSpoiler.onclick = function() {
          commentsSpoiler.style.display = 'none';
          postComments.style.display = 'block';

          opened[post.id] = opened[post.id] | 2;
          chrome.extension.sendRequest({method: "setOpened", id: post.id, state: 2});
        }
      }
    }

    post.processed = true;
  });
}

function toggleComments(spoiler) {
  for (var i = 0; i < spoiler.parent.children.length; i++) {
    spoiler.parent.children[i].style.display = 'block';
  }
  spoiler.style.display = 'none';
}

function togglePost(spoiler) {
  for (var i = 1; i < spoiler.parent.children.length; i++) {
    spoiler.parent.children[i].style.display = 'block';
  }
  spoiler.style.display = 'none';
}

var rules = [];
var opened = {};
chrome.extension.sendRequest({method: "getConfig"}, function(response) {
  rules = response.rules;
  opened = response.opened;
  (new MutationObserver(function(mutations, observer) {
    mutations.forEach(function(mutation) {
      if (mutation.target.id == 'wrap3' || mutation.target.id == 'profile_wide' || mutation.target.id == 'results_wrap') {
        update();
      } else if (mutation.target.id == 'page_wall_posts' || mutation.target.id == 'feed_rows' || mutation.target.id.indexOf('feed_row') === 0) {
        update(mutation.target);
      }
    });
  })).observe(ge('page_body'), {
    childList: true,
    subtree: true
  });
  update();
});