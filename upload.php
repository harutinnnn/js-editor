<?php

$obj = new stdClass();
$obj->url = null;
if (isset($_FILES['image']) && $_FILES['image']['error'] == 0) {
    $name = $_FILES['image']['name'];
    if (@move_uploaded_file($_FILES['image']['tmp_name'], 'uploads/' . $name)) {
        $obj->url = 'http://cq-new.local/uploads/' . $name;
    }

}

echo json_encode($obj);