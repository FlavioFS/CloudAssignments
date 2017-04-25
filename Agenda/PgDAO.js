/**
 * Created by MeronSoda on 09/04/2017.
 */

"use strict";   // ES6

/** PostgreSQL Data Access Object
 *
 */
module.exports = class PgDAO {

    /* ==================================================================
     *    Attributes
     * ================================================================== */
    get pg () { return this._pg; }
    get config () { return this._config; }
    get pool () { return this._pool; }

    set config (value) { this._config = value; }
    set pool (value) { this._pool = value; }


    /* ==================================================================
     *    Constructor
     * ================================================================== */
    constructor (config)
    {
        this._pg = require('pg');
        this.pool = new this.pg.Pool(config);

        this.pool.on('error',
            () => console.error('idle client error', err.message, err.stack)
        );
    }


    /* ==================================================================
     *    Methods
     * ================================================================== */
    query (queryString, callback)
    {
        console.log(queryString);

        this.pool.query(queryString, function(err, data) {
            callback({err: err, data: data});

            if (err)
                console.error("error running query\n'" + queryString +"':\n", err);
        });
    }


    // CREATE -----------------------------------------------------------------
    queryCreateUser (columns, callback)
    {
        let queryString = "INSERT INTO users values (" +
            "'" + columns.name.toString()     + "', " +
            "'" + columns.nick.toString()     + "', " +
            "'" + columns.email.toString()    + "', " +
            "'" + columns.phone.toString()    + "', " +
            "'" + columns.birthday.toString() + "')";

        this.query(queryString, callback);
    }


    // RETRIEVE ---------------------------------------------------------------
    queryRetrieveUser (username, callback)
    {
        let queryString = "SELECT * FROM users WHERE name='" + username + "' order by name";
        this.query(queryString, callback);
    }

    queryRetrieveUserList (callback)
    {
        let queryString = "SELECT * FROM users order by name";
        this.query(queryString, callback);
    }

    queryRetrieveUsersByParams (params, callback)
    {
        let queryString = "SELECT * FROM users WHERE ";
        let and = false;

        if (params.name && params.name != '')
        {
            queryString += "name='" + params.name + "'";
            and = true;
        }

        if (params.nick && params.nick != '')
        {
            if (and)
                queryString += ' and ';

            queryString += "nick='" + params.nick + "'";
            and = true;
        }

        if (params.birthdayMin && params.birthdayMin != '')
        {
            if (and)
                queryString += ' and ';

            queryString += "birthday>='" + params.birthdayMin + "'";
            and = true;
        }

        if (params.birthdayMax && params.birthdayMax != '')
        {
            if (and)
                queryString += ' and ';

            queryString += "birthday<='" + params.birthdayMax + "'";
        }

        queryString += " order by name";
        this.query(queryString, callback);
    }


    // UPDATE -----------------------------------------------------------------
    queryUpdateUser (username, newColumns, callback)
    {
        let queryString = "UPDATE users SET " +
            "name='"     + newColumns.name.toString()     + "', " +
            "nick='"     + newColumns.nick.toString()     + "', " +
            "email='"    + newColumns.email.toString()    + "', " +
            "phone='"    + newColumns.phone.toString()    + "', " +
            "birthday='" + newColumns.birthday.toString() + "' " +
            "where name='" + username + "'";

        this.query(queryString, callback);
    }


    // DELETE -----------------------------------------------------------------
    queryDeleteUser (username, callback)
    {
        let queryString = "DELETE FROM users WHERE name='" + username + "'";
        this.query(queryString, callback);
    }

};