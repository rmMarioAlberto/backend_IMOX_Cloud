-- Active: 1766943507460@@127.0.0.1@5432@imox_postgres@public
CREATE TABLE users (
    id serial PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(50) NOT NULL,
    role INT NOT NULL, -- 2: Admin, 1: User
    status INT NOT NULL, -- 1: Active, 0: Inactive
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

drop table users;

CREATE TABLE iot (
    id serial PRIMARY KEY,
    mac_address VARCHAR(50) NOT NULL,
    last_connection TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status INT NOT NULL, -- 1: Active, 0: Inactive
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id)
)

drop table iot;