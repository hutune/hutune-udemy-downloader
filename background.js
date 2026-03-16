// === CONFIG ===
// Domain được cấu hình qua Settings UI, lưu vào chrome.storage.local

// UI HELPERS for new top-nav layout
function showPage(id) {
  $('.page').removeClass('active').hide();
  $('#page-' + id).addClass('active').show();
  $('.nav-tab').removeClass('active');
  $('.nav-tab[data-page="' + id + '"]').addClass('active');
}
function setStatus(type, text) {
  var dot = $('#statusDot');
  dot.removeClass('connected error');
  if (type === 'connected') dot.addClass('connected');
  else if (type === 'error') dot.addClass('error');
  $('#statusText').text(text);
}

function getUdemyBase() {
  return `https://${Application.domain}`;
}
function getUdemyApi(path) {
  return `${getUdemyBase()}/api-2.0/${path}`;
}

var FolderName = "Udemy Download/";
var Downloads = [];
var load = {};
var course = {};
var video = {};
video.base = new Array();
function getLoadPackOpts() {
  try {
    var mode = ($('#loadPackMode .seg-btn.active').data('value') || 'recent');
    var n = parseInt($('#limitCourses').val(), 10);
    if (!Number.isFinite(n) || n <= 0) { n = 5; }
    var q = ($.trim($('#courseName').val() || ''));
    return { mode: mode, limit: n, query: q };
  } catch (e) { return { mode: 'recent', limit: 5, query: '' }; }
}
$(document).ready(function () {
  /* LOADPACK_TOGGLE */
  try {
    function _lp_toggle() {
      var m = ($('#loadPackMode .seg-btn.active').data('value') || 'recent');
      if (m === 'recent') {
        $('.mode-recent').show(); $('.mode-name').hide();
        $('#limitCourses').prop('disabled', false);
        $('#courseName').prop('disabled', true);
      } else {
        $('.mode-recent').hide(); $('.mode-name').show();
        $('#limitCourses').prop('disabled', true);
        $('#courseName').prop('disabled', false);
      }
    }
    $(document).on('click', '#loadPackMode .seg-btn', _lp_toggle);
    _lp_toggle();
  } catch (e) { console.warn('loadpack toggle err', e); }

  /* SETTINGS PANEL HANDLERS */
  // Populate settings UI from storage
  try {
    chrome.storage.local.get(['udemyDomain', 'globalQuality', 'defaultSubtitle', 'parallelCount', 'skipDownloaded'], function (result) {
      if (result.udemyDomain) {
        $('#domainInput').val(result.udemyDomain);
        $('#domainStatus').text('Domain hiện tại: ' + result.udemyDomain).css('color', 'green');
      }
      if (result.globalQuality) { $('#globalQuality').val(result.globalQuality); }
      if (result.defaultSubtitle) { $('#defaultSubtitle').prop('checked', true); }
      if (result.parallelCount) { $('#parallelCount').val(String(result.parallelCount)); }
      if (result.skipDownloaded) { $('#skipDownloaded').prop('checked', true); }
    });
  } catch (e) { console.warn('storage populate err', e); }

  // Save domain button
  $(document).on('click', '#saveDomainBtn', function () {
    var domain = $.trim($('#domainInput').val()).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (!domain || domain.indexOf('.') === -1) {
      $('#domainStatus').text('❌ Domain không hợp lệ!').css('color', 'red');
      return;
    }
    try {
      chrome.storage.local.set({ udemyDomain: domain }, function () {
        $('#domainStatus').text('✓ Đã lưu: ' + domain).css('color', 'green');
        Application.domain = domain;
      });
    } catch (e) { console.warn('storage save domain err', e); }
  });

  // Apply all settings button
  $(document).on('click', '#applySettings', function () {
    var domain = $.trim($('#domainInput').val()).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    if (!domain || domain.indexOf('.') === -1) {
      $('#domainStatus').text('❌ Domain không hợp lệ!').css('color', 'red');
      return;
    }
    var quality = $('#globalQuality').val();
    var subtitle = $('#defaultSubtitle').is(':checked');
    var parallel = parseInt($('#parallelCount').val(), 10) || 1;
    var skipDl = $('#skipDownloaded').is(':checked');
    try {
      chrome.storage.local.set({ udemyDomain: domain, globalQuality: quality, defaultSubtitle: subtitle, parallelCount: parallel, skipDownloaded: skipDl }, function () {
        Application.domain = domain;
        Application.globalQuality = quality;
        Application.defaultSubtitle = subtitle;
        Application.parallelCount = parallel;
        Application.skipDownloaded = skipDl;
        $('#domainStatus').text('✓ Đã lưu tất cả cài đặt!').css('color', 'var(--success)');
        setTimeout(function () { showPage('home'); }, 800);
      });
    } catch (e) { console.warn('storage apply err', e); }
  });

  /* LIGHT MODE TOGGLE (dark is default, light-mode class added) */
  try {
    chrome.storage.local.get(['lightMode'], function (result) {
      if (result.lightMode) { $('body').addClass('light-mode'); $('#themeToggle').html('☀️'); }
    });
  } catch (e) { console.warn('theme load err', e); }

  $(document).on('click', '#themeToggle', function (e) {
    e.preventDefault();
    var isLight = $('body').toggleClass('light-mode').hasClass('light-mode');
    $(this).html(isLight ? '☀️' : '🌙');
    try { chrome.storage.local.set({ lightMode: isLight }, function () { }); } catch (e) { }
  });

  try {
    $('.version').text('v' + chrome.runtime.getManifest().version);
    $('Title').text(chrome.runtime.getManifest().name + ' v' + chrome.runtime.getManifest().version);
  } catch (e) { console.warn('manifest err', e); }
});
const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));
const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

var Application = {
  domain: '',
  globalQuality: '',
  defaultSubtitle: false,
  parallelCount: 1,
  skipDownloaded: false,
  isLoadingVideos: false,  // guard: prevents race conditions during video fetch
  hasScanned: false,       // toggle: Scan Courses ↔ Scan Lại
  isPaused: false,         // pause flag: checked between video fetches
  isCancelled: false,      // cancel flag: breaks out of PlayList loop
  init: function () {
    // Load domain + preferences from storage first
    try {
      chrome.storage.local.get(['udemyDomain', 'globalQuality', 'defaultSubtitle', 'parallelCount', 'skipDownloaded'], function (result) {
        Application.globalQuality = result.globalQuality || '';
        Application.defaultSubtitle = result.defaultSubtitle || false;
        Application.parallelCount = parseInt(result.parallelCount, 10) || 1;
        Application.skipDownloaded = result.skipDownloaded || false;
        if (!result.udemyDomain) {
          // No domain configured — switch to Settings tab
          showPage('settings');
          $('#domainStatus').text('⚠ Vui lòng nhập domain Udemy Business để bắt đầu.').css('color', 'var(--warning)');
          setStatus('error', 'No domain configured');
          return;
        }
        Application.domain = result.udemyDomain;
        Application.initWithDomain();
      });
    } catch (e) {
      console.warn('Application.init storage error:', e);
      setStatus('error', 'Storage unavailable');
    }
  },
  initWithDomain: function () {
    Application.Cookies = [];
    Application.Cookies = { ud_cache_user: "" };
    chrome.cookies.getAll({
      domain: Application.domain
    }, function (cookies) {
      for (var i = 0; i < cookies.length; i++) {
        Application.Cookies[cookies[i].name] = cookies[i].value;
      }
      if (Application.Cookies["ud_cache_user"] && Application.Cookies["ud_cache_user"].length > 2) {
        setStatus('connected', 'Connected to ' + Application.domain);
      } else {
        // Cookie check failed — show warning but keep UI functional
        setStatus('error', 'Not logged in at ' + Application.domain);
        $('#analyze').after(
          '<p id="loginWarning" style="color:var(--danger);margin-top:10px;font-size:13px;">' +
          '⚠ Chưa đăng nhập Udemy Business tại domain: <b>' + Application.domain + '</b><br>' +
          'Hãy đăng nhập tại domain đó trong Chrome rồi bấm <b>Scan My Courses</b> lại.' +
          '</p>'
        );
      }
      // Wire scan button once via event delegation (survives re-renders)
      $(document).off('click.scan', '#analyze').on('click.scan', '#analyze', function () {
        Application.doScan();
      });

      // Pause / Resume toggle
      $(document).off('click.pause', '#lp-pause-btn').on('click.pause', '#lp-pause-btn', function () {
        if (Application.isPaused) {
          // Resume
          Application.isPaused = false;
          $(this).html('\u23f8').attr('title', 'D\u1eebng');
        } else {
          // Pause
          Application.isPaused = true;
          $(this).html('\u25b6').attr('title', 'Ti\u1ebfp t\u1ee5c');
        }
      });

      // Cancel: set flag, unblock pause loop so the PlayList loop can detect cancel
      $(document).off('click.cancel', '#lp-cancel-btn').on('click.cancel', '#lp-cancel-btn', function () {
        Application.isCancelled = true;
        Application.isPaused = false;  // unblock pause-wait loop immediately
      });
    });
  },
  doScan: function () {
    // Block scan while a video playlist is being fetched
    if (Application.isLoadingVideos) return;
    // Always reset UI state before scanning
    $('#loginWarning').remove();
    $('#example').empty();
    $('#courseListHeader').hide().html('');
    // Show loading panel in "course scan" mode: no video row
    $('#lp-course-name').text('\u0110ang quét khóa học...');
    $('.lp-progress-track').addClass('is-indeterminate');  // sliding animation — no fixed % available
    $('.lp-video-row').hide();  // hide thumbnail/counter — N/A for course scan
    $('#counter').show();
    $('#analyze').prop('disabled', true)
      .html('<span class="glyphicon glyphicon-refresh"></span> Analyzing...');
    setTimeout(() => {
      Application.Course(getLoadPackOpts());
    }, 500);
  },
  resetScan: function () {
    Application.hasScanned = true;
    // After any scan, toggle button to "Scan Lại"
    $('#analyze').prop('disabled', false)
      .html('<span class="glyphicon glyphicon-refresh"></span> Scan Lại');
    $('#counter').hide();
    $('.lp-progress-track').removeClass('is-indeterminate');  // restore normal progress mode
    $('#lp-progress-fill').css('width', '0%');               // reset for next video load
    $('.lp-video-row').show();   // restore video row for next Get Videos call
  },
  clearResults: function () {
    // Called at the start of a new scan to reset the UI
    $('#example').html('');
    $('#courseListHeader').hide().html('');
  },
  Course: function (opts) {
    load.url = getUdemyApi("users/me/subscribed-courses/");
    load.type = "GET";
    load.data = {
      "page_size": 4,
      "ordering": "-last_accessed",
      "fields[course]": "@min,visible_instructors,image_125_H,favorite_time,archive_time,completion_ratio,last_accessed_time,enrollment_time,is_practice_test_course,features,num_collections,published_title,is_private,buyable_object_type,num_published_lectures",
      "fields[user]": "@min,job_title",
      "page": 1
    }
    // === LOAD PACK MODES (non-breaking) ===
    var _mode = (opts && opts.mode) ? opts.mode : 'recent';
    var _limit = (opts && Number.isFinite(opts.limit) && opts.limit > 0) ? opts.limit : 5;
    var _query = (opts && opts.query) ? String(opts.query).toLowerCase() : '';
    if (_mode === 'recent') {
      load.data.page = 1;
      load.data.page_size = _limit;
      load.data.ordering = '-last_accessed';
      course.type = 'CourseList';
      course.CourseList = this.uGetApi(load);
      try { if (course.CourseList && Array.isArray(course.CourseList.results)) { course.CourseList.results = course.CourseList.results.slice(0, _limit); } } catch (e) { }
      Application.sendExtension(course.type, course.CourseList);
      return;
    }
    if (_mode === 'name' && _query.length > 0) {
      load.data.page = 1;
      load.data.page_size = 100;
      load.data.ordering = '-last_accessed';
      var acc = { count: 0, results: [] };
      for (var _p = 1; _p <= 5; _p++) {
        load.data.page = _p;
        var _res = this.uGetApi(load);
        if (_p === 1 && _res && typeof _res.count === 'number') acc.count = _res.count;
        if (_res && Array.isArray(_res.results)) {
          var _filtered = _res.results.filter(function (c) {
            var t = '';
            try { t = ((c.title || '') + ' ' + (c.published_title || '') + ' ' + (c.url || '')).toLowerCase(); } catch (e) { }
            return t.indexOf(_query) !== -1;
          });
          acc.results = acc.results.concat(_filtered);
        }
        if (acc.results.length > 0) break;
      }
      course.type = 'CourseList';
      course.CourseList = acc;
      Application.sendExtension(course.type, course.CourseList);
      return;
    }
    // === END LOAD PACK MODES ===
    ;
    var CourseCount = this.uGetApi(load); // get count
    course.type = "CourseList";
    if (CourseCount.count > 100) {
      load.data.page_size = CourseCount.count; // write page size
      course.CourseList = this.uGetApi(load); // get course list
      for (i = 1; i < parseInt((CourseCount.count - 1) / 100) + 1; i++) // 106 2 201 3 
      {
        load.data.page = i + 1;
        $.merge(course.CourseList.results, this.uGetApi(load).results); // get course list
      }
    } else {
      load.data.page_size = CourseCount.count; // write page size
      course.CourseList = this.uGetApi(load); // get course list
    }
    Application.sendExtension(course.type, course.CourseList);
  },
  Counter: async function (obj) {
    if (obj.Total !== undefined) {
      $('#lp-total').text(obj.Total);
    }
    if (obj.Current !== undefined) {
      $('#lp-current').text(obj.Current);
      var pct = (obj.Total && obj.Total > 0)
        ? Math.round(obj.Current / obj.Total * 100) : 0;
      $('#lp-progress-fill').css('width', pct + '%');
    }
    if (obj.Title) {
      $('#lp-video-title').text(obj.Current + '. ' + obj.Title);
    }
    if (obj.Thumbnail) {
      $('#lp-thumb').attr('src', obj.Thumbnail);
    }
  },
  PlayList: async function () {

    video.base = new Array();
    load.url = getUdemyApi(`courses/${Application.CourseId}/subscriber-curriculum-items`);
    load.type = "GET";
    load.data = {
      "page_size": "1400",
      "fields[lecture]": "title,object_index,is_published,sort_order,created,asset,supplementary_assets,is_free",
      "fields[quiz]": "title,object_index,is_published,sort_order,type",
      "fields[practice]": "title,object_index,is_published,sort_order",
      "fields[chapter]": "title,object_index,is_published,sort_order",
      "fields[asset]": "title,filename,asset_type,status,time_estimation,is_external",
      "caching_intent": "True"
    };
    var getVideoList = this.uGetApi(load);
    video.type = "PlayList";

    VideoIdList = $.grep(getVideoList.results, function (element, index) {
      return (typeof element.asset !== 'undefined') ? (element.asset.asset_type === 'Video') : "";
    });
    // Build a chapter lookup: for each video, find the nearest preceding chapter
    var _chapterMap = {};
    var _currentChapter = 'No Chapter';
    getVideoList.results.forEach(function (item) {
      if (item._class === 'chapter') { _currentChapter = item.title || 'Chapter'; }
      else if (item._class === 'lecture' && item.asset && item.asset.asset_type === 'Video') {
        _chapterMap[item.id] = _currentChapter;
      }
    });
    var i = 1;
    Application.Counter({ "Total": VideoIdList.length });

    // Use for-loop (not asyncForEach) so we can break on cancel
    for (let k = 0; k < VideoIdList.length; k++) {
      const v = VideoIdList[k];

      await waitFor(0);  // yield to event loop between videos

      // Pause: wait here until resumed or cancelled
      while (Application.isPaused && !Application.isCancelled) {
        await waitFor(100);
      }

      // Cancel: stop fetching, discard partial data
      if (Application.isCancelled) {
        Application.isCancelled = false;
        Application.isPaused = false;
        Application.isLoadingVideos = false;
        $('#counter').hide();
        $('.lp-controls').hide();
        $('.lp-video-row').show();
        // Restore all Get Videos buttons
        $('.btn-get-videos').prop('disabled', false)
          .removeClass('btn-loading').html('▶ Get Videos');
        $('.course-card').removeClass('course-card-active');
        return;  // exit PlayList without calling sendExtension
      }

      var temp = {};
      temp.url = getUdemyApi("users/me/subscribed-courses/") + Application.CourseId + "/lectures/" + v.id;
      temp.type = "GET";
      temp.data = {
        "fields[lecture]": "asset,description,download_url,is_free,last_watched_second",
        "fields[asset]": "asset_type,length,stream_urls,captions,thumbnail_sprite,slides,slide_urls,download_urls,image_125_H"
      };
      var VideoDetails;
      VideoDetails = await Application.uGetApiAsync(temp);  // true async: UI stays responsive
      // Update loading panel with current video info
      Application.Counter({
        Current: i,
        Total: VideoIdList.length,
        Title: v.title,
        Thumbnail: (VideoDetails.asset && VideoDetails.asset.thumbnail_sprite)
          ? VideoDetails.asset.thumbnail_sprite.img_url : ''
      });
      // Capture all available stream qualities
      var _qualities = (VideoDetails.asset.stream_urls && VideoDetails.asset.stream_urls.Video)
        ? VideoDetails.asset.stream_urls.Video : [];
      // Select quality based on global preference
      var _selQ = _qualities[0] || {};
      if (Application.globalQuality && _qualities.length > 0) {
        var _qMatch = _qualities.find(function (q) { return q.label === Application.globalQuality; });
        if (_qMatch) _selQ = _qMatch;
      }
      // Capture captions/subtitles
      var _captions = (VideoDetails.asset.captions && Array.isArray(VideoDetails.asset.captions))
        ? VideoDetails.asset.captions : [];
      video.base.push({
        "id": v.id,
        "VideoUrl": _selQ.file || '',
        "VideoTitle": v.object_index + ". " + v.title,
        "VideoThumbnail": ((VideoDetails.asset.thumbnail_sprite != null) ? VideoDetails.asset.thumbnail_sprite.img_url : ""),
        "VideoQuality": _selQ.label || '',
        "VideoQualities": _qualities,
        "VideoCaptions": _captions,
        "ChapterTitle": _chapterMap[v.id] || 'No Chapter',
        "Attachments": (v.supplementary_assets && Array.isArray(v.supplementary_assets)) ? v.supplementary_assets : []
      });
      i++;
    }

    Application.sendExtension(video.type, video.base);
  },
  sendExtension: function (a, b) {
    Application.Core({ "Step": a, "Data": b });
    if (a === 'CourseList') {
      Application.resetScan();
    }
    if (a === 'PlayList') {
      Application.isLoadingVideos = false;   // release guard
      Application.isPaused = false;
      Application.isCancelled = false;
      $('#lp-controls').hide();
    }
  },
  uGetApi: function (data, type = "") {
    const results = $.ajax({
      url: data.url,
      type: data.type,
      "headers": {
        "Content-Type": "application/json, text/plain, */*",
        "x-udemy-authorization": "Bearer " + Application.Cookies["access_token"],
        "x-udemy-cache-brand": Application.Cookies["ud_cache_brand"],
        "x-udemy-cache-campaign-code": Application.Cookies["ud_cache_campaign_code"],
        "x-udemy-cache-device": Application.Cookies["ud_cache_device"],
        "x-udemy-cache-language": Application.Cookies["ud_cache_language"],
        "x-udemy-cache-logged-in": Application.Cookies["ud_cache_logged_in"],
        "x-udemy-cache-marketplace-country": Application.Cookies["ud_cache_marketplace_country"],
        "x-udemy-cache-modern-browser": Application.Cookies["ud_cache_modern_browser"],
        "x-udemy-cache-price-country": Application.Cookies["ud_cache_price_country"],
        "x-udemy-cache-release": Application.Cookies["ud_cache_release"],
        "x-udemy-cache-user": Application.Cookies["ud_cache_user"],
        "x-udemy-cache-version": Application.Cookies["ud_cache_version"]
      },
      async: false,
      data: data.data,
      beforeSend: function () {
      },
      statusCode: {
        200: function (e) {
          Application.Counter(type);
          return e;
        },
        404: function (e) {
          Application.Debug("Api Exception");
        }
      }
    });
    return results.responseJSON;
  },
  // Async version used in PlayList loop so the UI thread stays free
  // (enabling pause/cancel buttons to respond immediately during fetch)
  uGetApiAsync: function (data) {
    return new Promise(function (resolve) {
      $.ajax({
        url: data.url,
        type: data.type,
        "headers": {
          "Content-Type": "application/json, text/plain, */*",
          "x-udemy-authorization": "Bearer " + Application.Cookies["access_token"],
          "x-udemy-cache-brand": Application.Cookies["ud_cache_brand"],
          "x-udemy-cache-campaign-code": Application.Cookies["ud_cache_campaign_code"],
          "x-udemy-cache-device": Application.Cookies["ud_cache_device"],
          "x-udemy-cache-language": Application.Cookies["ud_cache_language"],
          "x-udemy-cache-logged-in": Application.Cookies["ud_cache_logged_in"],
          "x-udemy-cache-marketplace-country": Application.Cookies["ud_cache_marketplace_country"],
          "x-udemy-cache-modern-browser": Application.Cookies["ud_cache_modern_browser"],
          "x-udemy-cache-price-country": Application.Cookies["ud_cache_price_country"],
          "x-udemy-cache-release": Application.Cookies["ud_cache_release"],
          "x-udemy-cache-user": Application.Cookies["ud_cache_user"],
          "x-udemy-cache-version": Application.Cookies["ud_cache_version"]
        },
        data: data.data,
        success: function (e) { resolve(e); },
        error: function () { resolve({}); }  // resolve empty on error, don't crash loop
      });
    });
  },
  renderVideoList: function (data) {
    var self = this;
    self.Type = 'Download';
    self.data = data;
    $('#counter').hide();
    $('#courseListHeader').hide();

    // Normalize data to always be an array
    if (!Array.isArray(data)) {
      console.warn('[renderVideoList] data is not an array:', typeof data, data);
      data = [];
    }

    var query = '';

    function getCourse() {
      if (!self.CourseData || !self.CourseData.Data || !self.CourseData.Data.results) return null;
      return self.CourseData.Data.results.find(function (c) { return c.id == self.CourseId; }) || null;
    }


    function filtered() {
      if (!query) return data;
      var q = query.toLowerCase();
      return data.filter(function (v) { return (v.VideoTitle || '').toLowerCase().indexOf(q) !== -1; });
    }

    function buildDownloadItem(v, $card) {
      var $c = $card || $('.video-card[data-id="' + v.id + '"]');
      var fileurl = v.VideoUrl;
      var $qSel = $c.find('.quality-select');
      if ($qSel.length && $qSel.val()) fileurl = $qSel.val();
      var subtitleUrl = null;
      var $subSel = $c.find('.subtitle-select');
      if ($subSel.length && $subSel.val()) subtitleUrl = $subSel.val();
      var course = getCourse();
      var instructor = (course && course.visible_instructors && course.visible_instructors[0])
        ? self.replaceFileName(course.visible_instructors[0].display_name) : 'Unknown';
      var courseName = course ? self.replaceFileName(course.title) : 'Unknown Course';
      return {
        trid: v.id, fileurl: fileurl, subtitleUrl: subtitleUrl,
        foldername: FolderName + instructor + '/' + courseName + '/',
        filename: self.replaceFileName(v.VideoTitle || 'video') + '.mp4'
      };
    }

    function cardHtml(v) {
      var quals = v.VideoQualities || [];
      var qualOpts = quals.length
        ? quals.map(function (q) {
          var sel = q.label === v.VideoQuality ? ' selected' : '';
          return '<option value="' + (q.file || '') + '" data-label="' + (q.label || '') + '"' + sel + '>' + (q.label || '?') + '</option>';
        }).join('')
        : '<option value="' + (v.VideoUrl || '') + '">' + (v.VideoQuality || 'N/A') + '</option>';

      var caps = v.VideoCaptions || [];
      var capHtml;
      if (caps.length) {
        var pref = caps.find(function (c) { return c.locale_id && c.locale_id.indexOf('vi') === 0; })
          || caps.find(function (c) { return c.locale_id && c.locale_id.indexOf('en') === 0; })
          || caps[0];
        var capOpts = caps.map(function (c) {
          var sel = (c === pref) ? ' selected' : '';
          return '<option value="' + (c.url || '') + '"' + sel + '>' + (c.locale_id || c.title || 'sub') + '</option>';
        }).join('');
        capHtml = '<span class="vl-caption-wrap"><select class="subtitle-select vl-select">' + capOpts + '</select></span>';
      } else {
        capHtml = '';
      }

      var attachHtml = (v.Attachments && v.Attachments.length)
        ? '<button class="btn-attach-vl" data-id="' + v.id + '">' + v.Attachments.length + ' file(s)</button>'
        : '';

      var thumb = v.VideoThumbnail
        ? '<img class="video-thumb" src="' + v.VideoThumbnail + '" alt="" onerror="this.style.display=\'none\'">'
        : '<div class="video-thumb"></div>';

      return '<div class="video-card" data-id="' + v.id + '">'
        + '<div class="video-card-check"><input type="checkbox" class="vl-check"></div>'
        + thumb
        + '<div class="video-info">'
        + '<div class="video-title">' + (v.VideoTitle || '') + '</div>'
        + '<div class="video-meta"><select class="quality-select vl-select">' + qualOpts + '</select>' + capHtml + attachHtml + '</div>'
        + '</div>'
        + '<div class="video-actions"><button class="btn-download-vl" data-id="' + v.id + '">Download</button></div>'
        + '</div>';
    }

    function renderCards() {
      var fdata = filtered();
      if (!fdata.length) return '<div class="vl-empty">No videos found.</div>';
      var groups = [], seen = {};
      fdata.forEach(function (v) {
        var ch = v.ChapterTitle || 'No Chapter';
        if (!seen[ch]) { seen[ch] = true; groups.push({ ch: ch, items: [] }); }
        groups[groups.length - 1].items.push(v);
      });
      return groups.map(function (g) {
        return '<div class="chapter-header">' + g.ch + '</div>' + g.items.map(cardHtml).join('');
      }).join('');
    }

    function updateSelectBtn() {
      var total = $('.vl-check').length;
      var checked = $('.vl-check:checked').length;
      if (checked === 0) {
        $('#vl-dl-selected').prop('disabled', true).text('Download Selected');
        $('#vl-select-all').text('Select All');
      } else {
        $('#vl-dl-selected').prop('disabled', false).text('Download ' + checked + ' Video' + (checked === 1 ? '' : 's'));
        $('#vl-select-all').text(checked === total ? 'Deselect All' : 'Select All');
      }
    }

    function render() {
      var total = filtered().length;
      var toolbar =
        '<div class="vl-toolbar">'
        + '<div class="vl-toolbar-left">'
        + '<button class="vl-btn vl-btn-accent" id="vl-back">\u00ab Back</button>'
        + '<button class="vl-btn vl-btn-outline" id="vl-select-all">Select All</button>'
        + '<button class="vl-btn vl-btn-outline" id="vl-reanalyze">\u21ba Re-Analyze</button>'
        + '<button class="vl-btn vl-btn-accent" id="vl-dl-selected" disabled>Download Selected</button>'
        + '</div>'
        + '<div class="vl-toolbar-right">'
        + '<span class="vl-count">' + total + ' video' + (total !== 1 ? 's' : '') + '</span>'
        + '<button class="vl-btn vl-btn-outline" id="vl-export-csv">Export CSV</button>'
        + '<button class="vl-btn vl-btn-outline" id="vl-export-json">Export JSON</button>'
        + '<input type="text" class="vl-search" id="vl-search" placeholder="Search..." value="' + query + '">'
        + '</div>'
        + '</div>';
      $('#courseListHeader').html(toolbar).show();
      $('#example').html('<div class="course-list" id="vl-cards">' + renderCards() + '</div>');
      updateSelectBtn();
    }

    $(document)
      .off('.vl')
      .on('click.vl', '#vl-back', function () {
        $('#courseListHeader').show();
        Application.Course(getLoadPackOpts());
      })
      .on('input.vl', '#vl-search', function () {
        query = $(this).val();
        $('#vl-cards').html(renderCards());
        $('.vl-count').text(filtered().length + ' video' + (filtered().length !== 1 ? 's' : ''));
        updateSelectBtn();
      })
      .on('change.vl', '.vl-check', function () { updateSelectBtn(); })
      .on('click.vl', '#vl-select-all', function () {
        var all = $('.vl-check');
        all.prop('checked', all.filter(':checked').length < all.length);
        updateSelectBtn();
      })
      .on('click.vl', '#vl-reanalyze', function () {
        $('#example').empty(); $('#counter').show(); Application.PlayList();
      })
      .on('click.vl', '#vl-dl-selected', function () {
        var items = [];
        $('.video-card').each(function () {
          if ($(this).find('.vl-check').is(':checked')) {
            var id = $(this).data('id');
            var v = data.find(function (d) { return d.id == id; });
            if (v) items.push(buildDownloadItem(v, $(this)));
          }
        });
        if (items.length) Application.downloadSequentially(items, function () { });
      })
      .on('click.vl', '.btn-download-vl', function () {
        var id = $(this).data('id');
        var v = data.find(function (d) { return d.id == id; });
        if (!v) return;
        var $btn = $(this);
        $btn.prop('disabled', true).text('Downloading...');
        Application.downloadSequentially([buildDownloadItem(v, $btn.closest('.video-card'))], function () {
          $btn.text('Downloaded').addClass('done').prop('disabled', false);
        });
      })
      .on('click.vl', '.btn-attach-vl', function () {
        var id = $(this).data('id');
        var v = data.find(function (d) { return d.id == id; });
        if (!v || !v.Attachments) return;
        var course = getCourse();
        v.Attachments.forEach(function (att) {
          if (att.url_set && att.url_set.url) {
            chrome.downloads.download({
              url: att.url_set.url,
              filename: 'Udemy Download/' + (course ? self.replaceFileName(course.title) : 'Course') + '/' + self.replaceFileName(att.filename || att.title || 'attachment'),
              saveAs: false
            }, function () { });
          }
        });
      })
      .on('click.vl', '#vl-export-csv', function () {
        var csv = 'Title,Quality,Chapter\n' + data.map(function (r) {
          return '"' + (r.VideoTitle || '').replace(/"/g, '""') + '",'
            + '"' + (r.VideoQuality || '') + '",'
            + '"' + (r.ChapterTitle || '') + '"';
        }).join('\n');
        chrome.downloads.download({ url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv), filename: 'video_list.csv', saveAs: true }, function () { });
      })
      .on('click.vl', '#vl-export-json', function () {
        var json = JSON.stringify(data.map(function (r) {
          return { id: r.id, title: r.VideoTitle, quality: r.VideoQuality, chapter: r.ChapterTitle };
        }), null, 2);
        chrome.downloads.download({ url: 'data:application/json;charset=utf-8,' + encodeURIComponent(json), filename: 'video_list.json', saveAs: true }, function () { });
      });

    render();
  },
  CreateTable: function (obj) {
    $("#example").empty();
    $("#example").append(
      '<table id="linkTable" class="table" cellspacing="0" width="100%"></table>'
    );

    var linkTable = $("#linkTable").DataTable({
      //dom: 'Blfrtip',
      dom: "Blftip",
      data: obj.data,
      rowId: "id",
      ordering: false,
      lengthChange: obj.lengthChange,
      lengthMenu: [5],
      scrollY: 500,
      scrollX: true,
      scrollCollapse: true,
      iDisplayLength: obj.DisplayLength,
      paging: obj.Paging,
      bFilter: true,
      columns: obj.columns,
      buttons: obj.buttons,
      columnDefs: obj.columnDefs,
      rowGroup: obj.rowGroup || false,
      language: {
        info: "searched : _TOTAL_ ",
        search: "_INPUT_",
        searchPlaceholder: "Search by name",
        infoFiltered: "in _MAX_",
      },
      initComplete: function () {
        $("#linkTable_length").attr(
          "style",
          "position:relative; display:inline; left:2%;"
        );
        $("#linkTable_length label").attr("style", "padding-top: 5px;");
        $("#linkTable_filter").attr(
          "style",
          "position:absolute; display:inline; right:1.4%;"
        );
        $(".dataTables_scrollBody").attr(
          "style",
          "position: relative; overflow: auto; width: 100%; max-height:472px; height:472px;"
        );
        $(".dataTables_length").addClass("bs-select");
        var rows = $("#linkTable").dataTable().$("tr", { filter: "applied" });
        var checkboxes = rows.find("td").find("input");
        // input onChange event.
        checkboxes.on("change", (i, e) => {
          var checkboxChecked = checkboxes.filter("input:checked").length; //checkbox checked count
          if (checkboxChecked > 0) {
            $("#SelectedVideos").prop("disabled", false);
            $("#SelectAll span").text("Select All");
            $("#SelectedVideos").text(
              "Download " +
              checkboxChecked +
              " " +
              (checkboxChecked === 1 ? "Video" : "Videos")
            );
          } else {
            $("#SelectedVideos").prop("disabled", true);
            $("#SelectedVideos").text("Download Selected Videos");
          }

          if ($(i.target).filter("input:checked").length == 0) {
            $(i.target)
              .parent(0)
              .parent(0)
              .parent(0)
              .removeClass("selected-td");
          } else {
            $(i.target).parent(0).parent(0).parent(0).addClass("selected-td");
          }
        });

        rows
          .find("td")
          .filter('[class*="td-4"]')
          .append(
            "<div class='progress' style='margin-top:3px; height:1.2rem;'><div class='progress-bar' role='progressbar' style='width: 0%; background-color:var(--secondary)!important' aria-valuenow='50' aria-valuemin='0' aria-valuemax='100'>0%</div></div>"
          );
        rows
          .find("td")
          .filter('[class*="td-4"]')
          .find('[class*="progress"]')
          .hide();
        /*
                eq index numarası
                var progress = rows.find('td').filter('[class*="td-4"]').find('[class*="progress"]')
                progress.eq(0).show();
                */
      },
    });
    $("#linkTable tbody").on("click", "button", function (e) {
      // Attachment download button
      if ($(this).hasClass('btn-attach')) {
        var data = $(this).parents("tr").attr("id");
        var VideoDetails = $.grep(Application.data, function (v) { return v.id == data; })[0];
        var CourseDetail = $.grep(Application.CourseData.Data.results, function (v) { return v.id == Application.CourseId; })[0];
        if (VideoDetails && VideoDetails.Attachments) {
          VideoDetails.Attachments.forEach(function (att) {
            if (att.url_set && att.url_set.url) {
              chrome.downloads.download({
                url: att.url_set.url,
                filename: 'Udemy Download/' + Application.replaceFileName(CourseDetail.title) + '/' + Application.replaceFileName(att.filename || att.title || 'attachment'),
                saveAs: false
              }, function () { });
            }
          });
        }
        return;
      }
      var data = $(this).parents("tr").attr("id");
      if (Application.Type == "Course") {

        $("#example").empty();
        $("#counter").show();
        Application.Counter({ Current: 0, Total: 0 });

        Application.CourseId = data;
        //setTimeout(()=>{
        Application.PlayList();
        //},1000);
      } else if (Application.Type == "Download") {
        var VideoDetails = $.grep(Application.data, function (v) {
          return v.id == data;
        })[0];
        var CourseDetail = $.grep(
          Application.CourseData.Data.results,
          function (v) {
            return v.id == Application.CourseId;
          }
        )[0];
        // Get selected quality URL from dropdown in this row
        var $dlRow = $(this).parents("tr");
        var $qSel = $dlRow.find('.quality-select');
        var _fileurl = ($qSel.length && $qSel.val()) ? $qSel.val() : VideoDetails.VideoUrl;
        // Get subtitle if checkbox is checked
        var $subChk = $dlRow.find('.subtitle-check');
        var $subSel = $dlRow.find('.subtitle-select');
        var _subtitleUrl = ($subChk.is(':checked') && $subSel.length && $subSel.val()) ? $subSel.val() : null;
        var temp = {};
        temp = {
          trid: data,
          fileurl: _fileurl,
          subtitleUrl: _subtitleUrl,
          foldername:
            FolderName +
            Application.replaceFileName(
              CourseDetail.visible_instructors[0].display_name
            ) +
            "/" +
            Application.replaceFileName(CourseDetail.title) +
            "/",
          filename:
            Application.replaceFileName(VideoDetails.VideoTitle) + ".mp4",
        };

        Downloads.push(temp);

        Application.downloadSequentially(Downloads, () => {
          var rows = $("#linkTable").dataTable().$("tr", { filter: "applied" });
          rows
            .find("td")
            .find('[class*="btn-download"]')
            .prop("disabled", false);
          var btnFinishes = $('[class*="btn-download"]:contains(Downloaded)');
          btnFinishes.text("Re-Download");
          btnFinishes.removeClass("btn-danger");
          btnFinishes.addClass("btn-success");

          btnFinishes = null;

          var rows = $("#linkTable").dataTable().$("tr", { filter: "applied" });
          var checkboxChecked = rows
            .find("td")
            .find("input")
            .filter("input:checked").length;
          if (checkboxChecked > 0) {
            $("#SelectedVideos").prop("disabled"), false;
          }
        });
      } else {
        alert("Malformed data please try again");
      }
    });
  },
  GetSprite: function (data, type, full, meta) {
    // Use plain img tag — background-image in inline style is blocked by MV3 CSP
    return '<img src="' + data + '" style="width:80px;height:50px;object-fit:cover;border-radius:6px;display:block;" loading="lazy" onerror="this.style.background=\'#1E293B\';this.removeAttribute(\'src\')">';
  },
  GetImg: function (data, type, full, meta) {
    return '<img src="' + data + '" style="max-width:120px;border-radius:6px;" loading="lazy"/>';
  },
  downloadSequentially: function (urls, callback) {
    var concurrency = Math.max(1, Application.parallelCount || 1);
    var skipDL = Application.skipDownloaded || false;
    var index = 0;
    var activeCount = 0;
    var finished = 0;
    var total = urls.length;

    if (total === 0) { callback(); return; }

    chrome.downloads.onChanged.addListener(onChanged);

    // Launch initial slots
    for (var s = 0; s < concurrency; s++) { next(); }

    function next() {
      if (index >= total) {
        // No more to start; if all finished, fire callback
        if (finished >= total) {
          chrome.downloads.onChanged.removeListener(onChanged);
          callback();
        }
        return;
      }

      var item = urls[index];
      index++;

      var fileurl = item.fileurl;
      var foldername = item.foldername;
      var filename = item.filename;
      var subtitleUrl = item.subtitleUrl || null;
      var trid = item.trid;

      // Find row index for progress UI
      var videoRowIndex = 0;
      $("#linkTable").dataTable().$("tr", { filter: "applied" }).each(function (k, v) {
        if (v.id == trid) { videoRowIndex = k; }
      });

      // Mark row UI as downloading
      var rows = $("#linkTable").dataTable().$("tr", { filter: "applied" });
      var $downloadBtn = rows.filter("[id*=" + trid + "]").find("td").eq(-1).find("button");
      $downloadBtn.prop("disabled", true).text("Downloading");

      // Skip-downloaded: check if filename already exists in recent downloads
      if (skipDL) {
        chrome.downloads.search({ filenameRegex: filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }, function (items) {
          var alreadyDone = items.some(function (it) { return it.state === 'complete' && !it.error; });
          if (alreadyDone) {
            $downloadBtn.prop("disabled", false).text("Skipped ✓").removeClass("btn-warning").addClass("btn-success");
            finished++;
            next();
            return;
          }
          startDownload(fileurl, foldername, filename, subtitleUrl, trid, videoRowIndex);
        });
      } else {
        startDownload(fileurl, foldername, filename, subtitleUrl, trid, videoRowIndex);
      }
    }

    function startDownload(fileurl, foldername, filename, subtitleUrl, trid, videoRowIndex) {
      activeCount++;
      if (!fileurl) { done(trid); return; }

      chrome.downloads.download(
        { url: fileurl, filename: foldername + filename, saveAs: false, conflictAction: "overwrite" },
        function (id) {
          // Store mapping id→item so onChanged knows which row
          startDownload._map = startDownload._map || {};
          startDownload._map[id] = { trid: trid, videoRowIndex: videoRowIndex, filename: filename, foldername: foldername };
        }
      );
      // Fire-and-forget subtitle
      if (subtitleUrl) {
        chrome.downloads.download({
          url: subtitleUrl,
          filename: foldername + filename.replace(/\.mp4$/i, '.vtt'),
          saveAs: false,
          conflictAction: "overwrite",
        }, function () { });
      }
    }

    function done(trid) {
      activeCount--;
      finished++;
      var rows = $("#linkTable").dataTable().$("tr", { filter: "applied" });
      var $btn = rows.filter("[id*=" + trid + "]").find("td").eq(-1).find("button");
      $btn.prop("disabled", false).text("Downloaded").removeClass("btn-warning").addClass("btn-danger");
      Downloads = [];
      if (finished >= total) {
        chrome.downloads.onChanged.removeListener(onChanged);
        callback();
      } else {
        next(); // slot freed, pick next
      }
    }

    function onChanged({ id, state }) {
      var map = startDownload._map || {};
      if (map[id] && state && state.current !== "in_progress") {
        var item = map[id];
        delete map[id];
        done(item.trid);
      } else if (map[id] && id > 0) {
        setTimeout(function () { pollProgress(id); }, 250);
        var rows = $("#linkTable").dataTable().$("tr", { filter: "applied" });
        rows.find("td").find('[class*="btn-download"]').prop("disabled", true);
        $("#SelectedVideos").prop("disabled", true);
      }
    }

    function pollProgress(downId) {
      var map = startDownload._map || {};
      if (!map[downId]) return;
      var item = map[downId];
      chrome.downloads.search({ id: downId }, function (items) {
        items.forEach(function (dl) {
          if (dl.state === "in_progress" && dl.totalBytes) {
            var pct = parseInt((dl.bytesReceived / dl.totalBytes) * 100);
            var rows = $("#linkTable").dataTable().$("tr", { filter: "applied" });
            var $progressDiv = rows.filter("[id*=" + item.trid + "]").find("td").eq(-1).find(".progress");
            var $progressBar = rows.filter("[id*=" + item.trid + "]").find("td").eq(-1).find(".progress-bar");
            if ($progressDiv.is(":hidden")) { $progressDiv.show(); $progressBar.css("background-color", "var(--warning)"); }
            $progressBar.css("width", pct + "%").text(pct + "%");
            rows.filter("[id*=" + item.trid + "]").addClass("blink");
          }
        });
      });
    }
  },
  Core: function (obj) {
    switch (obj.Step) {
      case "CourseList":
        $("#counter").hide();
        Application.CourseData = obj;
        Application.Type = "Course";
        var courses = obj.Data.results || [];

        // Build header: just course count — #analyze button handles re-scan
        var headerHtml = '<div class="course-list-header">';
        headerHtml += '<span class="course-count">' + courses.length + ' kho\u00e1 h\u1ecdc</span>';
        headerHtml += '</div>';
        $('#courseListHeader').html(headerHtml).show();

        // Only course cards go inside #example (scroll container)
        var html = '<div class="course-list">';
        courses.forEach(function (c, i) {
          var thumb = c.image_125_H || '';
          var title = c.title || 'Untitled';
          var id = c.id || i;
          html += '<div class="course-card" data-id="' + id + '" data-idx="' + i + '">';
          if (thumb) {
            html += '<img class="course-thumb" src="' + thumb + '" onerror="this.style.background=\'var(--card-2)\';this.removeAttribute(\'src\')" alt="">';
          } else {
            html += '<div class="course-thumb course-thumb-empty">\ud83d\udcda</div>';
          }
          var count = c.num_published_lectures || 0;
          html += '<div class="course-info"><div class="course-title">' + title + '</div>'
            + (count ? '<div class="course-video-count">~' + count + ' lectures</div>' : '')
            + '</div>';
          html += '<button class="btn-accent btn-get-videos" data-id="' + id + '" data-idx="' + i + '">\u25b6 Get Videos</button>';
          html += '</div>';
        });
        html += '</div>';
        $('#example').html(html);
        Application.resetScan();

        // Remove rescan handler (no longer needed — #analyze toggles)

        $(document).off('click.getvideos', '.btn-get-videos').on('click.getvideos', '.btn-get-videos', function () {
          // Prevent starting a new fetch while one is already in progress
          if (Application.isLoadingVideos) return;
          Application.isLoadingVideos = true;
          var idx = parseInt($(this).data('idx'), 10);
          var c = courses[idx];
          if (!c) { Application.isLoadingVideos = false; return; }
          // Dim the clicked button so user knows it's in progress
          $(this).prop('disabled', true).addClass('btn-loading').html('⏳ Loading...');
          $('.course-card').removeClass('course-card-active');
          $(this).closest('.course-card').addClass('course-card-active');
          // Initialise loading panel
          $('#lp-course-name').text(c.title);
          $('#lp-thumb').attr('src', c.image_125_H || '');
          $('#lp-video-title').text('\u0110ang lấy danh sách video...');
          $('#lp-current').text('\u2013');
          $('#lp-total').text('?');
          $('#lp-progress-fill').css('width', '0%');
          $('#counter').show();
          // Reset pause/cancel flags; show controls
          Application.isPaused = false;
          Application.isCancelled = false;
          $('#lp-controls').show();
          $('#lp-pause-btn').html('⏸').attr('title', 'Dừng');
          load.url = getUdemyApi("courses/" + c.id + "/cached-subscriber-curriculum-items/");
          load.type = "GET";
          load.data = {
            "page_size": 400,
            "fields[lecture]": "@min,object_index,supplementary_assets,sort_order,is_free,course_id",
            "fields[asset]": "@min,time_estimation,captions,media_sources,stream_urls",
            "fields[chapter]": "@min,sort_order"
          };
          load.url2 = load.url;
          video.CourseName = c.title;
          video.InstructorName = (c.visible_instructors && c.visible_instructors[0]) ? c.visible_instructors[0].display_name : "Unknown";
          Application.CourseId = c.id;   // required: PlayList() builds its URL from Application.CourseId
          Application.PlayList(load, video.CourseName, video.InstructorName);
        });
        break;
      case "PlayList":
        Application.renderVideoList(obj.Data);
        break;
      default:
        Application.data = null;
        break;
    }
  },
  Debug: function (exception) {
    console.log(exception);
  },
  espaceRegExp: function (str) {
    return str.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
  },
  replaceAll: function (str, find, replace) {
    return str.replace(
      new RegExp(Application.espaceRegExp(find), "g"),
      replace
    );
  },
  replaceFileName: function (str) {
    var filename = str;
    var invalid = ["\\", "/", ":", "*", "?", '"', "<", ">", "|"];
    $.each(invalid, function (key, value) {
      filename = Application.replaceAll(filename, value, "");
    });
    return filename;
  },
};

setTimeout(() => {
  Application.init();
}, 100);
