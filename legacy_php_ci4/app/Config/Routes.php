<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */

// Root -> Redirect to Admin Dashboard
$routes->get('/', function() {
    return redirect()->to(site_url('admin/dashboard'));
});

// Wablas Webhook Routes
$routes->match(['get', 'post'], 'webhook', 'Webhook::index');
$routes->match(['get', 'post'], 'webhook/wa', 'Webhook::wa');

// Admin Auth Routes
$routes->get('admin/login', 'Admin\Auth::login');
$routes->post('admin/do-login', 'Admin\Auth::doLogin');
$routes->get('admin/logout', 'Admin\Auth::logout');

// Admin Protected Dashboard & Management Routes
$routes->group('admin', function($routes) {
    $routes->get('dashboard', 'Admin\Dashboard::index');

    // Orders Management
    $routes->get('orders', 'Admin\Orders::index');
    $routes->get('orders/detail/(:num)', 'Admin\Orders::detail/$1');
    $routes->post('orders/update-status', 'Admin\Orders::updateStatus');

    // Menu Management
    $routes->get('menu', 'Admin\Menu::index');
    $routes->post('menu/save', 'Admin\Menu::save');
    $routes->post('menu/toggle/(:num)', 'Admin\Menu::toggleAvailability/$1');
    $routes->get('menu/delete/(:num)', 'Admin\Menu::delete/$1');

    // Bot & Wablas Settings
    $routes->get('settings', 'Admin\BotSettings::index');
    $routes->post('settings/save', 'Admin\BotSettings::save');
    $routes->post('settings/test-send', 'Admin\BotSettings::testSend');
    $routes->post('settings/simulate', 'Admin\BotSettings::simulateWebhook');
});
