<?php
if (isset($_SERVER['REQUEST_METHOD'])) {

    if ($_SERVER['REQUEST_METHOD'] == 'POST') {

        $data = json_decode(file_get_contents('php://input'));

        if (isset($data->text)) {
            file_put_contents($_SERVER['DOCUMENT_ROOT'] . '/data.json', $data->text);
        }

    } else {

        echo file_get_contents($_SERVER['DOCUMENT_ROOT'] . '/data.json');

    }
}
