// Tab switching for new top-nav layout
function showPage(id) {
  $('.page').removeClass('active').hide();
  $('#page-' + id).addClass('active').show();
  $('.nav-tab').removeClass('active');
  $('.nav-tab[data-page="' + id + '"]').addClass('active');
}

// Load pack mode toggle — reads from segmented control (not select)
function toggleLoadPackMode() {
  var m = $('#loadPackMode .seg-btn.active').data('value') || 'recent';
  $('#grp-recent').toggle(m === 'recent');
  $('#grp-name').toggle(m === 'name');
  $('.mode-recent').toggle(m === 'recent');
  $('.mode-name').toggle(m === 'name');
  $('#limitCourses').prop('disabled', m !== 'recent');
  $('#courseName').prop('disabled', m !== 'name');
}

$(function() {
  // Nav tab click
  $(document).on('click', '.nav-tab', function(e) {
    e.preventDefault();
    showPage($(this).data('page'));
  });

  // Segmented control click
  $(document).on('click', '#loadPackMode .seg-btn', function() {
    $('#loadPackMode .seg-btn').removeClass('active');
    $(this).addClass('active');
    toggleLoadPackMode();
  });

  toggleLoadPackMode();
});
