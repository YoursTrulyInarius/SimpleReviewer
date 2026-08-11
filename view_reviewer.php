<?php
$id = isset($_GET['id']) ? $_GET['id'] : '';
$location = 'reviewer.html';
if ($id !== '') {
    $location .= '?id=' . urlencode($id);
}
header('Location: ' . $location);
exit;
?>
